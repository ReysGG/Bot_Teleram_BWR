package com.k12stockroom.danabridge;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;

import java.time.Instant;

/**
 * Service foreground yang menjaga proses bridge tetap hidup:
 * - notifikasi persisten membuat Android enggan membunuh proses,
 * - tiap 5 menit: kirim heartbeat, kosongkan antrean event, cek listener,
 * - AlarmManager menghidupkan ulang service jika sempat terbunuh,
 * - listener yang terputus dipaksa rebind (termasuk trik toggle komponen).
 */
public final class BridgeForegroundService extends Service {
    private static final String CHANNEL_ID = "k12_stockroom_bridge_status";
    private static final int NOTIFICATION_ID = 1;
    private static final long TICK_INTERVAL_MS = 5 * 60_000L;
    private static final long WATCHDOG_INTERVAL_MS = 15 * 60_000L;
    private static final int WATCHDOG_REQUEST_CODE = 1001;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            runMaintenance();
            handler.postDelayed(this, TICK_INTERVAL_MS);
        }
    };

    static void start(Context context) {
        Intent intent = new Intent(context, BridgeForegroundService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {
            // Pembatasan background start; AlarmManager atau interaksi berikutnya akan mencoba lagi.
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            startForeground(NOTIFICATION_ID, buildNotification());
        } catch (Exception error) {
            // Android bisa menolak start foreground dari background (mis. saat boot
            // tanpa pengecualian baterai). Berhenti cepat mencegah crash proses;
            // listener/alarm berikutnya akan menghidupkan service lagi.
            BridgeConfig.listenerState(this, Instant.now() + "\nService foreground ditolak sistem (" + error.getClass().getSimpleName() + "). Akan dicoba lagi otomatis.");
            stopSelf();
            return;
        }
        scheduleWatchdog();
        handler.removeCallbacks(tick);
        handler.post(tick);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Dipanggil juga oleh alarm watchdog (ELAPSED_REALTIME_WAKEUP) — jalankan
        // maintenance segera supaya heartbeat/flush tetap terkirim walau Handler
        // tertunda saat CPU tidur.
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onTimeout(int startId) {
        // Jaga-jaga bila sistem memberi batas waktu tipe FGS: berhenti rapi tanpa
        // crash; alarm watchdog akan menghidupkan ulang.
        handler.removeCallbacks(tick);
        stopSelf();
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        onTimeout(startId);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void runMaintenance() {
        BridgeSender.sendHeartbeat(this);
        BridgeSender.flush(this, null);
        ensureListenerBound();
    }

    private int disconnectedTicks = 0;

    private void ensureListenerBound() {
        if (!notificationAccessEnabled()) {
            disconnectedTicks = 0;
            return;
        }
        if (DanaNotificationListener.isConnected()) {
            disconnectedTicks = 0;
            return;
        }

        disconnectedTicks += 1;
        ComponentName component = new ComponentName(this, DanaNotificationListener.class);
        NotificationListenerService.requestRebind(component);
        // Masa tenggang: setelah proses baru hidup, sistem butuh waktu melakukan bind
        // awal. Toggle komponen hanya dilakukan bila listener tetap terputus pada dua
        // tick berturut-turut (>= 5 menit) agar tidak mengganggu bind yang sedang jalan.
        if (disconnectedTicks < 2) return;

        // Trik standar memulihkan listener yang macet: nonaktifkan lalu aktifkan
        // komponen agar sistem melakukan bind ulang dari nol.
        try {
            PackageManager packageManager = getPackageManager();
            packageManager.setComponentEnabledSetting(component, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            packageManager.setComponentEnabledSetting(component, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            NotificationListenerService.requestRebind(component);
            BridgeConfig.listenerState(this, Instant.now() + "\nListener terputus - watchdog meminta sistem menghubungkan ulang.");
        } catch (Exception ignored) {
            // Jika gagal, percobaan berikutnya berjalan pada tick selanjutnya.
        }
    }

    private boolean notificationAccessEnabled() {
        ComponentName component = new ComponentName(this, DanaNotificationListener.class);
        String listeners = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return listeners != null && listeners.contains(component.flattenToString());
    }

    private void scheduleWatchdog() {
        try {
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;
            Intent intent = new Intent(this, BridgeForegroundService.class);
            PendingIntent pendingIntent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? PendingIntent.getForegroundService(this, WATCHDOG_REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
                : PendingIntent.getService(this, WATCHDOG_REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            alarmManager.setInexactRepeating(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL_MS,
                WATCHDOG_INTERVAL_MS,
                pendingIntent
            );
        } catch (Exception ignored) {
            // Tanpa alarm, service tetap hidup selama tidak dibunuh sistem.
        }
    }

    private Notification buildNotification() {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Status K12 Bridge", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Menandakan K12 Stockroom Bridge aktif memantau notifikasi pembayaran.");
            channel.setShowBadge(false);
            notificationManager.createNotificationChannel(channel);
        }
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return builder
            .setContentTitle("K12 Stockroom Bridge aktif")
            .setContentText("Memantau pembayaran DANA, Bank Jago, dan Shopee Partner untuk K12 Stockroom.")
            .setSmallIcon(R.drawable.ic_bridge)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .build();
    }
}
