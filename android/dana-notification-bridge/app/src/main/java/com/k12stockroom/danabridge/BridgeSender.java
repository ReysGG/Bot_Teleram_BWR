package com.k12stockroom.danabridge;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class BridgeSender {
    interface Callback {
        void complete(boolean success, String message);
    }

    interface DiagnosticsCallback {
        void complete(BridgeQueue.Diagnostics diagnostics, RuntimeException error);
    }

    private static final int MAX_EVENTS_PER_DRAIN = 50;
    private static final long CONNECT_TIMEOUT_MS = 15_000L;
    private static final long READ_TIMEOUT_MS = 15_000L;
    private static final ScheduledExecutorService DRAIN_EXECUTOR =
        Executors.newSingleThreadScheduledExecutor();
    private static final ExecutorService HEARTBEAT_EXECUTOR =
        Executors.newSingleThreadExecutor();
    private static final Object DRAIN_LOCK = new Object();
    private static final ConcurrentLinkedQueue<Callback> CALLBACKS = new ConcurrentLinkedQueue<>();
    private static final java.util.concurrent.atomic.AtomicBoolean HEARTBEAT_RUNNING =
        new java.util.concurrent.atomic.AtomicBoolean(false);
    private static ScheduledFuture<?> scheduledDrain;
    private static long scheduledDrainAt = 0L;

    private BridgeSender() {}

    /** Store first, then request one coalesced drain. The local queue is authoritative. */
    static boolean send(Context context, BridgeEvent event, Callback callback) {
        Context appContext = context.getApplicationContext();
        if (!BridgeQueue.enqueue(appContext, event)) {
            BridgeConfig.senderState(appContext, Instant.now() + "\nGagal menyimpan event; periksa penyimpanan perangkat.");
            if (callback != null) callback.complete(false, "Event tidak dapat disimpan di antrean lokal.");
            return false;
        }
        flush(appContext, callback);
        return true;
    }

    /** Schedule a single drain; repeated notifications never create a retry storm. */
    static void flush(Context context, Callback callback) {
        Context appContext = context.getApplicationContext();
        if (callback != null) CALLBACKS.add(callback);
        scheduleDrain(appContext, 0L);
    }

    /** User-triggered recovery for blocked rows after fixing endpoint/configuration. */
    static void retryNow(Context context, Callback callback) {
        Context appContext = context.getApplicationContext();
        DRAIN_EXECUTOR.execute(() -> {
            try {
                BridgeQueue.retryAll(appContext);
            } catch (RuntimeException error) {
                BridgeConfig.senderState(
                    appContext,
                    Instant.now() + "\nAntrean gagal dibuka (" + safeErrorCode(error) + ")."
                );
                if (callback != null) {
                    callback.complete(false, "Antrean lokal belum dapat dibuka. Data lama tidak dihapus.");
                }
                return;
            }
            flush(appContext, callback);
        });
    }

    static void sendTest(Context context, Callback callback) {
        Context appContext = context.getApplicationContext();
        DRAIN_EXECUTOR.execute(() -> send(appContext, testEvent(appContext), callback));
    }

    static void loadDiagnostics(Context context, DiagnosticsCallback callback) {
        Context appContext = context.getApplicationContext();
        HEARTBEAT_EXECUTOR.execute(() -> {
            try {
                callback.complete(BridgeQueue.diagnostics(appContext), null);
            } catch (RuntimeException error) {
                callback.complete(null, error);
            }
        });
    }

    /** Heartbeat has its own executor so a slow payment retry cannot starve health signals. */
    static void sendHeartbeat(Context context) {
        Context appContext = context.getApplicationContext();
        if (!HEARTBEAT_RUNNING.compareAndSet(false, true)) return;
        HEARTBEAT_EXECUTOR.execute(() -> {
            try {
                if (configurationError(appContext) != null) return;
                BridgeQueue.Diagnostics diagnostics = BridgeQueue.diagnostics(appContext);
                JSONObject payload = new JSONObject()
                    .put("deviceId", BridgeConfig.deviceId(appContext))
                    .put("queueSize", diagnostics.totalCount())
                    .put("pendingQueueSize", diagnostics.pendingCount)
                    .put("blockedQueueSize", diagnostics.blockedCount)
                    .put("highestAttemptCount", diagnostics.highestAttemptCount)
                    .put("lastErrorCode", diagnostics.lastErrorCode == null ? JSONObject.NULL : diagnostics.lastErrorCode)
                    .put("appVersion", BuildConfig.VERSION_NAME)
                    .put("appVersionCode", BuildConfig.VERSION_CODE)
                    .put("listenerConnected", DanaNotificationListener.isConnected())
                    .put("queueStorageVersion", BridgeQueue.storageVersion());
                payload.put(
                    "oldestQueuedAt",
                    diagnostics.oldestEnqueuedAt > 0
                        ? Instant.ofEpochMilli(diagnostics.oldestEnqueuedAt).toString()
                        : JSONObject.NULL
                );
                String json = payload.toString();
                HttpResult result = post(
                    appContext,
                    heartbeatEndpoint(BridgeConfig.endpoint(appContext)),
                    json
                );
                BridgeConfig.heartbeatState(
                    appContext,
                    Instant.now() + (result.status >= 200 && result.status < 300
                        ? "\nHeartbeat terkirim. Server tahu bridge hidup."
                        : "\nHeartbeat gagal HTTP " + result.status + ".")
                );
            } catch (Exception error) {
                BridgeConfig.heartbeatState(
                    appContext,
                    Instant.now() + "\nHeartbeat gagal (" + safeErrorCode(error) + ")."
                );
            } finally {
                HEARTBEAT_RUNNING.set(false);
            }
        });
    }

    private static void scheduleDrain(Context context, long delayMs) {
        long dueAt = System.currentTimeMillis() + Math.max(0L, delayMs);
        synchronized (DRAIN_LOCK) {
            if (scheduledDrain != null && !scheduledDrain.isDone()) {
                if (dueAt >= scheduledDrainAt) return;
                scheduledDrain.cancel(false);
            }
            scheduledDrainAt = dueAt;
            scheduledDrain = DRAIN_EXECUTOR.schedule(
                () -> runDrain(context.getApplicationContext()),
                Math.max(0L, delayMs),
                TimeUnit.MILLISECONDS
            );
        }
    }

    private static void runDrain(Context context) {
        try {
            runDrainSafely(context);
        } catch (RuntimeException error) {
            BridgeConfig.senderState(
                context,
                Instant.now() + "\nWorker antrean gagal (" + safeErrorCode(error) + "). Retry otomatis dijadwalkan."
            );
            finishCallbacks(false, "Antrean lokal sementara bermasalah; retry dijadwalkan otomatis.");
            scheduleDrain(context, 30_000L);
        }
    }

    private static void runDrainSafely(Context context) {
        synchronized (DRAIN_LOCK) {
            scheduledDrain = null;
            scheduledDrainAt = 0L;
        }

        String configError = configurationError(context);
        if (configError != null) {
            finishCallbacks(false, configError);
            return;
        }

        int processed = 0;
        while (processed < MAX_EVENTS_PER_DRAIN) {
            BridgeQueue.Entry entry = BridgeQueue.oldestPending(context);
            if (entry == null) {
                BridgeQueue.Diagnostics diagnostics = BridgeQueue.diagnostics(context);
                String attention = diagnostics.blockedCount > 0
                    ? " Perlu perhatian: " + diagnostics.blockedCount + " event ditahan."
                    : "";
                BridgeConfig.senderState(
                    context,
                    Instant.now() + "\nAntrean selesai. Event tertahan: " + diagnostics.blockedCount + "."
                );
                finishCallbacks(true, "Antrean kosong." + attention);
                return;
            }

            long now = System.currentTimeMillis();
            if (entry.nextAttemptAt > now) {
                long waitMs = entry.nextAttemptAt - now;
                BridgeConfig.senderState(
                    context,
                    Instant.now() + "\nRetry berikutnya dalam " + Math.max(1L, waitMs / 1000L) + " detik."
                );
                finishCallbacks(false, "Event tersimpan; retry dijadwalkan otomatis.");
                scheduleDrain(context, waitMs);
                return;
            }

            SendOutcome outcome = attemptSend(context, BridgeConfig.endpoint(context), entry.event);
            processed += 1;
            if (outcome.success) {
                BridgeQueue.removeAccepted(context, entry.event.eventId);
                continue;
            }

            int attempt = entry.attemptCount + 1;
            if (outcome.permanent) {
                BridgeQueue.markBlocked(context, entry.event.eventId, attempt, outcome.errorCode, outcome.status);
                BridgeConfig.senderState(
                    context,
                    Instant.now() + "\nEvent ditahan HTTP " + outcome.status + "; tekan 'Coba ulang antrean' setelah memperbaiki konfigurasi."
                );
                // A blocked event cannot head-of-line block valid future payments.
                continue;
            }

            long delay = BridgeRetryPolicy.nextDelayMs(
                attempt,
                outcome.retryAfterMs,
                ThreadLocalRandom.current().nextDouble()
            );
            long nextAttempt = System.currentTimeMillis() + delay;
            BridgeQueue.markTransientFailure(
                context,
                entry.event.eventId,
                attempt,
                nextAttempt,
                outcome.errorCode,
                outcome.status
            );
            BridgeConfig.senderState(
                context,
                Instant.now() + "\nPengiriman gagal (" + outcome.errorCode + "); retry dalam " +
                    Math.max(1L, delay / 1000L) + " detik."
            );
            finishCallbacks(false, "Event tersimpan di antrean dan akan dicoba ulang otomatis.");
            scheduleDrain(context, delay);
            return;
        }

        // Yield between batches so a large backlog cannot monopolize the sender thread.
        finishCallbacks(false, "Antrean masih diproses.");
        scheduleDrain(context, 0L);
    }

    private static void finishCallbacks(boolean success, String message) {
        Callback callback;
        while ((callback = CALLBACKS.poll()) != null) {
            try {
                callback.complete(success, message);
            } catch (RuntimeException ignored) {
                // A UI callback must never stop the payment drain.
            }
        }
    }

    private static String configurationError(Context context) {
        String endpoint = BridgeConfig.endpoint(context);
        String secret = BridgeConfig.secret(context);
        if (!endpoint.startsWith("https://") || secret.length() < 32) {
            return "Konfigurasi belum lengkap. Gunakan URL HTTPS dan secret minimal 32 karakter.";
        }
        return null;
    }

    private static String heartbeatEndpoint(String endpoint) {
        if (endpoint.endsWith("/notification")) {
            return endpoint.substring(0, endpoint.length() - "/notification".length()) + "/heartbeat";
        }
        return endpoint.replaceFirst("/notification(\\?|$)", "/heartbeat$1");
    }

    private static final class SendOutcome {
        final boolean success;
        final boolean permanent;
        final int status;
        final long retryAfterMs;
        final String errorCode;

        SendOutcome(boolean success, boolean permanent, int status, long retryAfterMs, String errorCode) {
            this.success = success;
            this.permanent = permanent;
            this.status = status;
            this.retryAfterMs = retryAfterMs;
            this.errorCode = errorCode;
        }
    }

    private static final class HttpResult {
        final int status;
        final long retryAfterMs;

        HttpResult(int status, long retryAfterMs) {
            this.status = status;
            this.retryAfterMs = retryAfterMs;
        }
    }

    private static SendOutcome attemptSend(Context context, String endpoint, BridgeEvent event) {
        try {
            HttpResult result = post(context, endpoint, event.toJson());
            if (result.status >= 200 && result.status < 300) {
                return new SendOutcome(true, false, result.status, 0L, "HTTP_" + result.status);
            }
            boolean permanent = result.status >= 400 && result.status < 500 &&
                result.status != 401 && result.status != 408 &&
                result.status != 425 && result.status != 429;
            return new SendOutcome(
                false,
                permanent,
                result.status,
                result.retryAfterMs,
                "HTTP_" + result.status
            );
        } catch (Exception error) {
            return new SendOutcome(false, false, 0, 0L, safeErrorCode(error));
        }
    }

    private static HttpResult post(Context context, String endpoint, String json) throws Exception {
        String secret = BridgeConfig.secret(context);
        String timestamp = String.valueOf(System.currentTimeMillis());
        String signature = signature(secret, timestamp + "." + json);
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout((int) CONNECT_TIMEOUT_MS);
        connection.setReadTimeout((int) READ_TIMEOUT_MS);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("X-Bridge-Timestamp", timestamp);
        connection.setRequestProperty("X-Bridge-Signature", signature);
        try {
            try (OutputStream output = connection.getOutputStream()) {
                output.write(json.getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            long retryAfterMs = parseRetryAfterMs(connection.getHeaderField("Retry-After"));
            // Drain the response stream so the connection can be reused cleanly.
            readResponse(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            return new HttpResult(status, retryAfterMs);
        } finally {
            connection.disconnect();
        }
    }

    private static long parseRetryAfterMs(String value) {
        if (value == null || value.trim().isEmpty()) return 0L;
        try {
            long seconds = Long.parseLong(value.trim());
            if (seconds <= 0) return 0L;
            return Math.min(BridgeRetryPolicy.MAX_DELAY_MS, seconds * 1000L);
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    static BridgeEvent testEvent(Context context) {
        String seed = "test:" + System.currentTimeMillis();
        return new BridgeEvent(
            "test-" + sha256(seed),
            BridgeConfig.deviceId(context),
            "id.dana",
            "Tes koneksi bridge",
            "Event diagnostik ini tidak mengonfirmasi pembayaran.",
            Instant.now().toString()
        );
    }

    static String eventId(String value) {
        return sha256(value);
    }

    private static String signature(String secret, String value) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return toHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return toHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private static String readResponse(InputStream stream) {
        if (stream == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[256];
            int read = reader.read(buffer);
            return read > 0 ? new String(buffer, 0, Math.min(read, 256)) : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String safeErrorCode(Exception error) {
        return error.getClass().getSimpleName().replaceAll("[^a-zA-Z0-9]", "_");
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value & 0xff));
        return result.toString();
    }
}
