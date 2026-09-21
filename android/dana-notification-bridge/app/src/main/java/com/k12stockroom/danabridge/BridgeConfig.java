package com.k12stockroom.danabridge;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.UUID;

final class BridgeConfig {
    private static final String PREFERENCES = "k12_stockroom_dana_bridge";
    private static final String ENDPOINT_KEY = "endpoint";
    private static final String SECRET_KEY = "secret";
    private static final String ENCRYPTED_SECRET_KEY = "encrypted_secret";
    private static final String DEVICE_ID_KEY = "device_id";
    private static final String LOG_KEY = "last_log";
    private static final String LISTENER_STATE_KEY = "listener_state";
    private static final String LISTENER_DIAGNOSTIC_KEY = "listener_diagnostic";
    private static final String HEARTBEAT_STATE_KEY = "heartbeat_state";
    private static final String SENDER_STATE_KEY = "sender_state";
    private static final String QUEUE_STATE_KEY = "queue_state";
    private static final String DEFAULT_ENDPOINT = "https://70-153-137-10.sslip.io/api/bridge/android/notification";

    private BridgeConfig() {}

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    static String endpoint(Context context) {
        return stringValue(preferences(context), ENDPOINT_KEY, DEFAULT_ENDPOINT);
    }

    static String secret(Context context) {
        SharedPreferences preferences = preferences(context);
        String encrypted = stringValue(preferences, ENCRYPTED_SECRET_KEY, "");
        if (encrypted != null && !encrypted.trim().isEmpty()) return BridgeSecretStore.decrypt(encrypted);

        String legacy = stringValue(preferences, SECRET_KEY, "");
        if (legacy == null || legacy.trim().isEmpty()) return "";
        preferences.edit()
            .putString(ENCRYPTED_SECRET_KEY, BridgeSecretStore.encrypt(legacy.trim()))
            .remove(SECRET_KEY)
            .apply();
        return legacy.trim();
    }

    static String deviceId(Context context) {
        SharedPreferences preferences = preferences(context);
        String existing = stringValue(preferences, DEVICE_ID_KEY, "");
        if (existing != null && !existing.trim().isEmpty()) return existing;
        String generated = "android-" + UUID.randomUUID();
        preferences.edit().putString(DEVICE_ID_KEY, generated).apply();
        return generated;
    }

    static void save(Context context, String endpoint, String secret) {
        preferences(context).edit()
            .putString(ENDPOINT_KEY, endpoint.trim())
            .putString(ENCRYPTED_SECRET_KEY, BridgeSecretStore.encrypt(secret.trim()))
            .remove(SECRET_KEY)
            .apply();
    }

    static String lastLog(Context context) {
        return stringValue(preferences(context), LOG_KEY, "Belum ada event dikirim.");
    }

    static void log(Context context, String message) {
        preferences(context).edit().putString(LOG_KEY, message).apply();
    }

    static String listenerState(Context context) {
        return stringValue(preferences(context), LISTENER_STATE_KEY, "Belum pernah terhubung sejak aplikasi dipasang.");
    }

    static void listenerState(Context context, String message) {
        preferences(context).edit().putString(LISTENER_STATE_KEY, message).apply();
    }

    static String listenerDiagnostic(Context context) {
        return stringValue(preferences(context), LISTENER_DIAGNOSTIC_KEY, "Belum ada notifikasi kandidat yang terdeteksi.");
    }

    static void listenerDiagnostic(Context context, String message) {
        preferences(context).edit().putString(LISTENER_DIAGNOSTIC_KEY, message).apply();
    }

    static String heartbeatState(Context context) {
        return stringValue(preferences(context), HEARTBEAT_STATE_KEY, "Belum ada heartbeat terkirim.");
    }

    static void heartbeatState(Context context, String message) {
        preferences(context).edit().putString(HEARTBEAT_STATE_KEY, message).apply();
    }

    static String senderState(Context context) {
        return stringValue(preferences(context), SENDER_STATE_KEY, "Belum ada pengiriman event.");
    }

    static void senderState(Context context, String message) {
        preferences(context).edit().putString(SENDER_STATE_KEY, message).apply();
    }

    static String queueState(Context context) {
        return stringValue(preferences(context), QUEUE_STATE_KEY, "Antrean pembayaran lokal siap digunakan.");
    }

    static void queueState(Context context, String message) {
        preferences(context).edit().putString(QUEUE_STATE_KEY, message).apply();
    }

    private static String stringValue(
        SharedPreferences preferences,
        String key,
        String fallback
    ) {
        try {
            String value = preferences.getString(key, fallback);
            return value == null ? fallback : value;
        } catch (ClassCastException error) {
            preferences.edit().remove(key).apply();
            return fallback;
        }
    }
}
