package com.k12stockroom.danabridge;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Durable, synchronized payment outbox backed by one atomic preferences file. */
final class BridgeQueue {
    private static final int STORAGE_VERSION = 3;
    private static final int MAX_EVENTS = 500;
    private static final int STATE_PENDING = 0;
    private static final int STATE_BLOCKED = 1;
    private static final String QUEUE_KEY = "event_queue_v3";
    private static final String LEGACY_QUEUE_KEY = "event_queue";
    private static final String LEGACY_MIGRATED_KEY = "event_queue_sqlite_migrated";
    private static final String EMERGENCY_QUEUE_KEY = "event_queue_emergency";
    private static final Object QUEUE_LOCK = new Object();

    private BridgeQueue() {}

    static final class Entry {
        final BridgeEvent event;
        final long enqueuedAt;
        final int attemptCount;
        final long nextAttemptAt;

        Entry(BridgeEvent event, long enqueuedAt, int attemptCount, long nextAttemptAt) {
            this.event = event;
            this.enqueuedAt = enqueuedAt;
            this.attemptCount = attemptCount;
            this.nextAttemptAt = nextAttemptAt;
        }
    }

    static final class Diagnostics {
        final int pendingCount;
        final int blockedCount;
        final long oldestEnqueuedAt;
        final long nextAttemptAt;
        final int highestAttemptCount;
        final String lastErrorCode;

        Diagnostics(
            int pendingCount,
            int blockedCount,
            long oldestEnqueuedAt,
            long nextAttemptAt,
            int highestAttemptCount,
            String lastErrorCode
        ) {
            this.pendingCount = pendingCount;
            this.blockedCount = blockedCount;
            this.oldestEnqueuedAt = oldestEnqueuedAt;
            this.nextAttemptAt = nextAttemptAt;
            this.highestAttemptCount = highestAttemptCount;
            this.lastErrorCode = lastErrorCode;
        }

        int totalCount() {
            return pendingCount + blockedCount;
        }
    }

    private static final class StoredEntry {
        final BridgeEvent event;
        long enqueuedAt;
        int state;
        int attemptCount;
        long nextAttemptAt;
        long lastAttemptAt;
        Integer lastHttpStatus;
        String lastErrorCode;

        StoredEntry(BridgeEvent event, long enqueuedAt) {
            this.event = event;
            this.enqueuedAt = enqueuedAt;
            this.state = STATE_PENDING;
        }

        JSONObject toJson() throws Exception {
            return new JSONObject(event.toJson())
                .put("enqueuedAt", enqueuedAt)
                .put("state", state)
                .put("attemptCount", attemptCount)
                .put("nextAttemptAt", nextAttemptAt)
                .put("lastAttemptAt", lastAttemptAt)
                .put("lastHttpStatus", lastHttpStatus == null ? JSONObject.NULL : lastHttpStatus)
                .put("lastErrorCode", lastErrorCode == null ? JSONObject.NULL : lastErrorCode);
        }

        static StoredEntry fromJson(JSONObject value, long fallbackTime) {
            BridgeEvent event = BridgeEvent.fromJson(value);
            if (event == null) return null;
            StoredEntry entry = new StoredEntry(
                event,
                Math.max(1L, value.optLong("enqueuedAt", fallbackTime))
            );
            entry.state = value.optInt("state", STATE_PENDING) == STATE_BLOCKED
                ? STATE_BLOCKED
                : STATE_PENDING;
            entry.attemptCount = Math.max(0, value.optInt("attemptCount", 0));
            entry.nextAttemptAt = Math.max(0L, value.optLong("nextAttemptAt", 0L));
            entry.lastAttemptAt = Math.max(0L, value.optLong("lastAttemptAt", 0L));
            if (!value.isNull("lastHttpStatus")) {
                entry.lastHttpStatus = value.optInt("lastHttpStatus", 0);
            }
            if (!value.isNull("lastErrorCode")) {
                entry.lastErrorCode = sanitizeCode(value.optString("lastErrorCode", ""));
            }
            return entry;
        }
    }

    static boolean enqueue(Context context, BridgeEvent event) {
        synchronized (QUEUE_LOCK) {
            try {
                List<StoredEntry> entries = loadAndMigrate(context);
                for (StoredEntry existing : entries) {
                    if (existing.event.eventId.equals(event.eventId)) return true;
                }
                if (entries.size() >= MAX_EVENTS) {
                    BridgeConfig.queueState(
                        context,
                        Instant.now() + "\nAntrean pembayaran penuh (" + MAX_EVENTS +
                            "). Event baru tidak dapat disimpan."
                    );
                    return false;
                }
                entries.add(new StoredEntry(event, System.currentTimeMillis()));
                save(context, entries);
                return true;
            } catch (Exception error) {
                BridgeConfig.queueState(
                    context,
                    Instant.now() + "\nAntrean lokal gagal menyimpan event (" +
                        error.getClass().getSimpleName() + ")."
                );
                return false;
            }
        }
    }

    static Entry oldestPending(Context context) {
        synchronized (QUEUE_LOCK) {
            List<StoredEntry> entries = loadAndMigrate(context);
            StoredEntry oldest = entries.stream()
                .filter(item -> item.state == STATE_PENDING)
                .min(Comparator.comparingLong(item -> item.enqueuedAt))
                .orElse(null);
            if (oldest == null) return null;
            return new Entry(
                oldest.event,
                oldest.enqueuedAt,
                oldest.attemptCount,
                oldest.nextAttemptAt
            );
        }
    }

    static void removeAccepted(Context context, String eventId) {
        synchronized (QUEUE_LOCK) {
            List<StoredEntry> entries = loadAndMigrate(context);
            boolean changed = entries.removeIf(item -> item.event.eventId.equals(eventId));
            if (changed) save(context, entries);
        }
    }

    static void markTransientFailure(
        Context context,
        String eventId,
        int attemptCount,
        long nextAttemptAt,
        String errorCode,
        Integer httpStatus
    ) {
        synchronized (QUEUE_LOCK) {
            List<StoredEntry> entries = loadAndMigrate(context);
            StoredEntry entry = find(entries, eventId);
            if (entry == null) return;
            entry.attemptCount = Math.max(0, attemptCount);
            entry.lastAttemptAt = System.currentTimeMillis();
            entry.nextAttemptAt = Math.max(0L, nextAttemptAt);
            entry.lastErrorCode = sanitizeCode(errorCode);
            entry.lastHttpStatus = httpStatus;
            save(context, entries);
        }
    }

    static void markBlocked(
        Context context,
        String eventId,
        int attemptCount,
        String errorCode,
        Integer httpStatus
    ) {
        synchronized (QUEUE_LOCK) {
            List<StoredEntry> entries = loadAndMigrate(context);
            StoredEntry entry = find(entries, eventId);
            if (entry == null) return;
            entry.state = STATE_BLOCKED;
            entry.attemptCount = Math.max(0, attemptCount);
            entry.lastAttemptAt = System.currentTimeMillis();
            entry.nextAttemptAt = 0L;
            entry.lastErrorCode = sanitizeCode(errorCode);
            entry.lastHttpStatus = httpStatus;
            save(context, entries);
        }
    }

    static void retryAll(Context context) {
        synchronized (QUEUE_LOCK) {
            List<StoredEntry> entries = loadAndMigrate(context);
            for (StoredEntry entry : entries) {
                entry.state = STATE_PENDING;
                entry.nextAttemptAt = 0L;
                entry.lastErrorCode = null;
                entry.lastHttpStatus = null;
            }
            save(context, entries);
        }
    }

    static int size(Context context) {
        return diagnostics(context).totalCount();
    }

    static int storageVersion() {
        return STORAGE_VERSION;
    }

    static Diagnostics diagnostics(Context context) {
        synchronized (QUEUE_LOCK) {
            List<StoredEntry> entries = loadAndMigrate(context);
            int pending = 0;
            int blocked = 0;
            long oldest = 0L;
            long nextAttempt = 0L;
            int highestAttempt = 0;
            StoredEntry latestError = null;
            for (StoredEntry entry : entries) {
                if (entry.state == STATE_BLOCKED) blocked += 1;
                else pending += 1;
                if (oldest == 0L || entry.enqueuedAt < oldest) oldest = entry.enqueuedAt;
                if (
                    entry.state == STATE_PENDING &&
                    entry.nextAttemptAt > 0L &&
                    (nextAttempt == 0L || entry.nextAttemptAt < nextAttempt)
                ) {
                    nextAttempt = entry.nextAttemptAt;
                }
                highestAttempt = Math.max(highestAttempt, entry.attemptCount);
                if (
                    entry.lastErrorCode != null &&
                    (latestError == null || entry.lastAttemptAt > latestError.lastAttemptAt)
                ) {
                    latestError = entry;
                }
            }
            return new Diagnostics(
                pending,
                blocked,
                oldest,
                nextAttempt,
                highestAttempt,
                latestError == null ? null : latestError.lastErrorCode
            );
        }
    }

    private static StoredEntry find(List<StoredEntry> entries, String eventId) {
        for (StoredEntry entry : entries) {
            if (entry.event.eventId.equals(eventId)) return entry;
        }
        return null;
    }

    private static List<StoredEntry> loadAndMigrate(Context context) {
        SharedPreferences preferences = BridgeConfig.preferences(context);
        String queueRaw = preferenceString(preferences, QUEUE_KEY);
        List<StoredEntry> entries;
        try {
            entries = parse(queueRaw);
        } catch (IllegalStateException error) {
            String backupKey = QUEUE_KEY + "_invalid_" + System.currentTimeMillis();
            boolean backedUp = preferences.edit()
                .putString(backupKey, queueRaw == null ? "" : queueRaw)
                .remove(QUEUE_KEY)
                .commit();
            if (!backedUp) throw error;
            entries = new ArrayList<>();
            BridgeConfig.queueState(
                context,
                Instant.now() + "\nData antrean JSON lama rusak dan diamankan sebagai " +
                    backupKey + ". Antrean baru tetap aktif."
            );
        }
        Set<String> seen = new HashSet<>();
        for (StoredEntry entry : entries) seen.add(entry.event.eventId);

        int migrated = 0;
        int waitingForSpace = 0;
        long now = System.currentTimeMillis();
        String[] sourceKeys = { EMERGENCY_QUEUE_KEY, LEGACY_QUEUE_KEY };
        List<List<StoredEntry>> remainingSources = new ArrayList<>();
        boolean migrationTouched = false;
        for (String sourceKey : sourceKeys) {
            if (!preferences.contains(sourceKey)) {
                remainingSources.add(new ArrayList<>());
                continue;
            }
            migrationTouched = true;
            String sourceRaw = preferenceString(preferences, sourceKey);
            List<StoredEntry> source;
            try {
                source = parse(sourceRaw);
            } catch (IllegalStateException error) {
                String backupKey = sourceKey + "_invalid_" + System.currentTimeMillis();
                boolean backedUp = preferences.edit()
                    .putString(backupKey, sourceRaw == null ? "" : sourceRaw)
                    .remove(sourceKey)
                    .commit();
                if (!backedUp) throw error;
                remainingSources.add(new ArrayList<>());
                BridgeConfig.queueState(
                    context,
                    Instant.now() + "\nSumber antrean lama rusak dan diamankan sebagai " +
                        backupKey + ". Antrean aktif tetap berjalan."
                );
                continue;
            }
            List<StoredEntry> remaining = new ArrayList<>();
            for (StoredEntry item : source) {
                if (!seen.add(item.event.eventId)) continue;
                if (entries.size() >= MAX_EVENTS) {
                    remaining.add(item);
                    waitingForSpace += 1;
                    continue;
                }
                if (item.enqueuedAt <= 0L) item.enqueuedAt = now + migrated;
                entries.add(item);
                migrated += 1;
            }
            remainingSources.add(remaining);
        }

        if (migrationTouched) {
            save(context, entries);
            SharedPreferences.Editor editor = preferences.edit()
                .putBoolean(LEGACY_MIGRATED_KEY, true);
            for (int index = 0; index < sourceKeys.length; index++) {
                String sourceKey = sourceKeys[index];
                List<StoredEntry> remaining = remainingSources.get(index);
                if (remaining.isEmpty()) editor.remove(sourceKey);
                else editor.putString(sourceKey, serialize(remaining));
            }
            boolean cleaned = editor.commit();
            if (!cleaned) throw new IllegalStateException("Queue migration cleanup failed");
            BridgeConfig.queueState(
                context,
                Instant.now() + "\nAntrean stabil aktif. " + migrated +
                    " event lama/darurat berhasil dipindahkan. " + waitingForSpace +
                    " event masih disimpan aman sambil menunggu ruang. SQLite lama tidak digunakan."
            );
        }

        entries.sort(
            Comparator.comparingLong((StoredEntry item) -> item.enqueuedAt)
                .thenComparing(item -> item.event.eventId)
        );
        return entries;
    }

    private static List<StoredEntry> parse(String raw) {
        List<StoredEntry> entries = new ArrayList<>();
        if (raw == null || raw.trim().isEmpty()) return entries;
        try {
            JSONArray array = new JSONArray(raw);
            long now = System.currentTimeMillis();
            for (int index = 0; index < array.length(); index++) {
                JSONObject value = array.optJSONObject(index);
                if (value == null) continue;
                StoredEntry entry = StoredEntry.fromJson(value, now + index);
                if (entry != null) entries.add(entry);
            }
        } catch (Exception error) {
            throw new IllegalStateException("Queue JSON cannot be parsed", error);
        }
        return entries;
    }

    private static String preferenceString(SharedPreferences preferences, String key) {
        try {
            return preferences.getString(key, "[]");
        } catch (ClassCastException error) {
            return "[]";
        }
    }

    private static void save(Context context, List<StoredEntry> entries) {
        try {
            boolean saved = BridgeConfig.preferences(context).edit()
                .putString(QUEUE_KEY, serialize(entries))
                .commit();
            if (!saved) throw new IllegalStateException("Queue commit failed");
        } catch (Exception error) {
            if (error instanceof RuntimeException) throw (RuntimeException) error;
            throw new IllegalStateException("Queue serialization failed", error);
        }
    }

    private static String serialize(List<StoredEntry> entries) {
        try {
            JSONArray array = new JSONArray();
            for (StoredEntry entry : entries) array.put(entry.toJson());
            return array.toString();
        } catch (Exception error) {
            throw new IllegalStateException("Queue serialization failed", error);
        }
    }

    private static String sanitizeCode(String value) {
        if (value == null || value.trim().isEmpty()) return "unknown";
        String sanitized = value.replaceAll("[^a-zA-Z0-9_.:-]", "_");
        return sanitized.substring(0, Math.min(100, sanitized.length()));
    }

    static void resetForTests(Context context) {
        synchronized (QUEUE_LOCK) {
            BridgeConfig.preferences(context).edit()
                .remove(QUEUE_KEY)
                .remove(EMERGENCY_QUEUE_KEY)
                .remove(LEGACY_QUEUE_KEY)
                .putBoolean(LEGACY_MIGRATED_KEY, true)
                .commit();
        }
    }
}
