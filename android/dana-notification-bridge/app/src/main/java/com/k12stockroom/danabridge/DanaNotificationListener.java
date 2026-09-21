package com.k12stockroom.danabridge;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.time.Instant;

public final class DanaNotificationListener extends NotificationListenerService {
    private static volatile boolean connected = false;

    static boolean isConnected() {
        return connected;
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        connected = true;
        BridgeConfig.listenerState(this, Instant.now() + "\nListener terhubung dan siap menangkap notifikasi DANA, Bank Jago, dan Shopee Partner.");
        BridgeForegroundService.start(this);
        BridgeSender.flush(this, null);
        try {
            StatusBarNotification[] activeNotifications = getActiveNotifications();
            if (activeNotifications == null) return;
            for (StatusBarNotification notification : activeNotifications) forwardNotification(notification);
        } catch (RuntimeException error) {
            BridgeConfig.listenerState(this, Instant.now() + "\nListener terhubung, tetapi gagal membaca notifikasi aktif: " + safeMessage(error));
        }
    }

    @Override
    public void onListenerDisconnected() {
        connected = false;
        BridgeConfig.listenerState(this, Instant.now() + "\nListener terputus. Watchdog akan menghubungkan ulang otomatis.");
        requestRebind(new android.content.ComponentName(this, DanaNotificationListener.class));
        super.onListenerDisconnected();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        forwardNotification(notification);
    }

    private void forwardNotification(StatusBarNotification notification) {
        Bundle extras = notification.getNotification().extras;
        String title = firstText(extras, Notification.EXTRA_TITLE, Notification.EXTRA_TITLE_BIG);
        String body = firstText(extras, Notification.EXTRA_BIG_TEXT, Notification.EXTRA_TEXT, Notification.EXTRA_SUB_TEXT, Notification.EXTRA_SUMMARY_TEXT, Notification.EXTRA_INFO_TEXT);
        if (body.isEmpty() && notification.getNotification().tickerText != null) {
            body = notification.getNotification().tickerText.toString().trim();
        }
        if (title.trim().isEmpty() && body.trim().isEmpty()) return;
        // Server menolak payload di atas batas ini; potong di sini supaya notifikasi
        // panjang (BigText promo dsb.) tidak pernah jadi event yang selalu gagal.
        if (title.length() > 500) title = title.substring(0, 500);
        if (body.length() > 2000) body = body.substring(0, 2000);

        String packageName = notification.getPackageName();
        boolean isGroupSummary =
            (notification.getNotification().flags & Notification.FLAG_GROUP_SUMMARY) != 0;
        PaymentNotificationClassifier.Classification classification =
            PaymentNotificationClassifier.classify(packageName, title, body, isGroupSummary);
        if (classification.action == PaymentNotificationClassifier.Action.UNTRUSTED) {
            if (PaymentNotificationClassifier.looksLikePayment(packageName, title, body)) {
                BridgeConfig.listenerDiagnostic(
                    this,
                    Instant.now() + "\nNotifikasi pembayaran ditemukan dari package yang belum diizinkan:\n" + packageName
                );
            }
            return;
        }
        if (classification.action == PaymentNotificationClassifier.Action.IGNORE) {
            BridgeConfig.listenerDiagnostic(
                this,
                Instant.now() + "\nNotifikasi " + classification.provider.displayName() +
                    " diabaikan: " + classification.reason + "."
            );
            return;
        }

        String providerName = classification.provider.displayName();
        BridgeConfig.listenerDiagnostic(
            this,
            Instant.now() + "\nNotifikasi " + providerName + " diterima dari package:\n" + packageName
        );

        String eventSeed = notification.getKey() + ":" + notification.getPostTime() + ":" + title + ":" + body;
        BridgeEvent event = new BridgeEvent(
            BridgeSender.eventId(eventSeed),
            BridgeConfig.deviceId(this),
            packageName,
            title,
            body,
            Instant.ofEpochMilli(notification.getPostTime()).toString()
        );
        boolean queued = BridgeSender.send(this, event, null);
        BridgeConfig.log(
            this,
            Instant.now() + "\nNotifikasi pembayaran " + providerName + " tertangkap dari " + packageName +
                ". Event " + event.eventId.substring(0, Math.min(12, event.eventId.length())) +
                (queued
                    ? " disimpan dan dijadwalkan untuk dikirim."
                    : " BELUM tersimpan karena antrean lokal bermasalah.")
        );
    }

    private static String text(Bundle extras, String key) {
        CharSequence value = extras.getCharSequence(key);
        return value == null ? "" : value.toString().trim();
    }

    private static String firstText(Bundle extras, String... keys) {
        for (String key : keys) {
            String value = text(extras, key);
            if (!value.isEmpty()) return value;
        }
        return "";
    }

    private static String safeMessage(RuntimeException error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? error.getClass().getSimpleName() : message;
    }
}
