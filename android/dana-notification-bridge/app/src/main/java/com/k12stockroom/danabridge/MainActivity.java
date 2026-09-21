package com.k12stockroom.danabridge;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.text.method.PasswordTransformationMethod;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.concurrent.atomic.AtomicBoolean;

public final class MainActivity extends Activity {
    private EditText endpointInput;
    private EditText secretInput;
    private TextView accessStatus;
    private TextView listenerStatus;
    private TextView listenerDiagnostic;
    private TextView queueDiagnostics;
    private TextView eventLog;
    private final AtomicBoolean diagnosticsLoading = new AtomicBoolean(false);
    private final Handler statusHandler = new Handler(Looper.getMainLooper());
    private final Runnable statusRefresh = new Runnable() {
        @Override
        public void run() {
            refreshStatus();
            statusHandler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildContent());
        BridgeForegroundService.start(this);
        requestPostNotificationsPermission();
    }

    private void requestPostNotificationsPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED) return;
        requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 100);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (notificationAccessEnabled()) {
            try {
                android.service.notification.NotificationListenerService.requestRebind(
                    new ComponentName(this, DanaNotificationListener.class)
                );
            } catch (RuntimeException error) {
                BridgeConfig.listenerState(
                    this,
                    java.time.Instant.now() + "\nRebind listener ditolak sistem (" +
                        error.getClass().getSimpleName() + "). Gunakan tombol hubungkan ulang."
                );
            }
        }
        refreshStatus();
        statusHandler.removeCallbacks(statusRefresh);
        statusHandler.postDelayed(statusRefresh, 1000);
    }

    @Override
    protected void onPause() {
        statusHandler.removeCallbacks(statusRefresh);
        super.onPause();
    }

    private View buildContent() {
        int padding = dp(24);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);
        content.setBackgroundColor(Color.rgb(246, 241, 232));

        TextView eyebrow = text("K12 STOCKROOM / PAYMENT TOOL", 12, Color.rgb(8, 126, 139));
        content.addView(eyebrow);
        TextView title = text("K12 Stockroom Bridge", 30, Color.rgb(18, 52, 59));
        title.setPadding(0, dp(8), 0, dp(8));
        content.addView(title);
        TextView description = text("Kirim notifikasi pembayaran DANA, Bank Jago, dan Shopee Partner ke website K12 Stockroom secara otomatis. Setup hanya sekali di HP toko ini.", 16, Color.rgb(55, 65, 67));
        description.setPadding(0, 0, 0, dp(24));
        content.addView(description);

        content.addView(label("Device ID bridge"));
        String deviceId = BridgeConfig.deviceId(this);
        TextView device = text(deviceId, 14, Color.rgb(18, 52, 59));
        device.setTextIsSelectable(true);
        device.setPadding(dp(14), dp(14), dp(14), dp(14));
        device.setBackgroundColor(Color.WHITE);
        content.addView(device);

        Button copyDeviceId = button("Salin Device ID");
        copyDeviceId.setOnClickListener(view -> copyDeviceId(deviceId));
        content.addView(copyDeviceId);

        content.addView(label("1. Endpoint website"));
        endpointInput = input("https://70-153-137-10.sslip.io/api/bridge/android/notification", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        endpointInput.setText(BridgeConfig.endpoint(this));
        content.addView(endpointInput);

        content.addView(label("2. Secret bridge (minimal 32 karakter)"));
        secretInput = input("Samakan dengan ANDROID_PAYMENT_BRIDGE_SECRET", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        secretInput.setTransformationMethod(PasswordTransformationMethod.getInstance());
        secretInput.setText(BridgeConfig.secret(this));
        content.addView(secretInput);

        Button save = button("Simpan konfigurasi");
        save.setOnClickListener(view -> saveConfiguration());
        content.addView(save);

        content.addView(label("3. Akses notifikasi"));
        accessStatus = text("", 15, Color.rgb(55, 65, 67));
        content.addView(accessStatus);
        listenerStatus = text("", 13, Color.rgb(90, 100, 102));
        listenerStatus.setPadding(0, dp(8), 0, 0);
        content.addView(listenerStatus);

        TextView restrictionHelp = text(
            "Yang diperlukan adalah menu Akses notifikasi. Opsi 'Tampilkan notifikasi' di Info aplikasi boleh abu-abu karena bridge tidak membuat notifikasi sendiri.",
            13,
            Color.rgb(174, 82, 49)
        );
        restrictionHelp.setPadding(0, dp(8), 0, dp(2));
        content.addView(restrictionHelp);

        Button appInfo = button("1. Izinkan setelan terbatas");
        appInfo.setOnClickListener(view -> openAppInfo());
        content.addView(appInfo);

        Button permission = button("2. Aktifkan akses notifikasi");
        permission.setOnClickListener(view -> openNotificationAccess());
        content.addView(permission);

        Button reconnect = button("3. Hubungkan ulang listener");
        reconnect.setOnClickListener(view -> reconnectListener());
        content.addView(reconnect);

        Button battery = button("4. Matikan optimasi baterai");
        battery.setOnClickListener(view -> openBatteryOptimization());
        content.addView(battery);

        content.addView(label("Diagnostik listener"));
        listenerDiagnostic = text("", 13, Color.rgb(55, 65, 67));
        listenerDiagnostic.setPadding(dp(14), dp(14), dp(14), dp(14));
        listenerDiagnostic.setBackgroundColor(Color.WHITE);
        content.addView(listenerDiagnostic);

        content.addView(label("Diagnostik antrean pembayaran"));
        queueDiagnostics = text("", 13, Color.rgb(55, 65, 67));
        queueDiagnostics.setPadding(dp(14), dp(14), dp(14), dp(14));
        queueDiagnostics.setBackgroundColor(Color.WHITE);
        content.addView(queueDiagnostics);

        Button retryQueue = button("Coba ulang antrean");
        retryQueue.setOnClickListener(view -> retryQueue(retryQueue));
        content.addView(retryQueue);

        Button test = button("Uji koneksi ke website");
        test.setOnClickListener(view -> testConnection(test));
        content.addView(test);

        content.addView(label("Event terakhir"));
        eventLog = text("", 13, Color.rgb(55, 65, 67));
        eventLog.setPadding(dp(14), dp(14), dp(14), dp(14));
        eventLog.setBackgroundColor(Color.WHITE);
        content.addView(eventLog);

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        return scrollView;
    }

    private boolean saveConfiguration() {
        String endpoint = endpointInput.getText().toString().trim();
        String secret = secretInput.getText().toString().trim();
        if (!endpoint.startsWith("https://")) {
            toast("Endpoint wajib menggunakan HTTPS.");
            return false;
        }
        if (secret.length() < 32) {
            toast("Secret minimal 32 karakter.");
            return false;
        }
        BridgeConfig.save(this, endpoint, secret);
        BridgeSender.retryNow(this, null);
        toast("Konfigurasi tersimpan. Antrean diperiksa di background.");
        refreshStatus();
        return true;
    }

    private void testConnection(Button button) {
        if (!saveConfiguration()) return;
        button.setEnabled(false);
        button.setText("Mengirim...");
        BridgeSender.sendTest(this, (success, message) -> runOnUiThread(() -> {
            button.setEnabled(true);
            button.setText("Uji koneksi ke website");
            toast(message);
            refreshStatus();
        }));
    }

    private void retryQueue(Button button) {
        button.setEnabled(false);
        button.setText("Menjadwalkan...");
        BridgeSender.retryNow(this, (success, message) -> runOnUiThread(() -> {
            button.setEnabled(true);
            button.setText("Coba ulang antrean");
            toast(message);
            refreshStatus();
        }));
    }

    private void refreshStatus() {
        if (accessStatus == null || listenerStatus == null || listenerDiagnostic == null || queueDiagnostics == null || eventLog == null) return;
        boolean enabled = notificationAccessEnabled();
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        boolean batteryExempt = powerManager != null && powerManager.isIgnoringBatteryOptimizations(getPackageName());
        accessStatus.setText(enabled ? "Akses membaca notifikasi aktif." : "Belum aktif - izinkan setelan terbatas dan akses notifikasi.");
        accessStatus.setTextColor(enabled ? Color.rgb(20, 120, 78) : Color.rgb(174, 82, 49));
        listenerStatus.setText(
            (batteryExempt ? "Optimasi baterai: sudah dikecualikan." : "PENTING: optimasi baterai BELUM dikecualikan - tekan tombol 4!")
                + "\n\nStatus service\n" + BridgeConfig.listenerState(this)
                + "\n" + BridgeConfig.heartbeatState(this)
        );
        refreshQueueDiagnostics();
        listenerDiagnostic.setText(BridgeConfig.listenerDiagnostic(this));
        eventLog.setText(BridgeConfig.lastLog(this));
    }

    private void refreshQueueDiagnostics() {
        if (!diagnosticsLoading.compareAndSet(false, true)) return;
        BridgeSender.loadDiagnostics(this, (queue, error) -> runOnUiThread(() -> {
            diagnosticsLoading.set(false);
            if (isFinishing() || queueDiagnostics == null) return;
            if (error != null || queue == null) {
                String code = error == null ? "Unknown" : error.getClass().getSimpleName();
                queueDiagnostics.setText(
                    "Versi aplikasi: " + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")"
                        + "\n\nAntrean lokal sedang dipulihkan di background."
                        + "\nAplikasi tidak akan ditutup dan data tidak dihapus otomatis."
                        + "\nKode: " + code
                        + "\n\n" + BridgeConfig.queueState(this)
                );
                return;
            }
            String oldest = queue.oldestEnqueuedAt > 0
                ? java.time.Instant.ofEpochMilli(queue.oldestEnqueuedAt).toString()
                : "-";
            String nextRetry = queue.nextAttemptAt > 0
                ? java.time.Instant.ofEpochMilli(queue.nextAttemptAt).toString()
                : "-";
            queueDiagnostics.setText(
                "Versi aplikasi: " + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")"
                    + "\nListener: " + (DanaNotificationListener.isConnected() ? "terhubung" : "belum terhubung")
                    + "\nAntrean pending: " + queue.pendingCount
                    + "\nPerlu perhatian: " + queue.blockedCount
                    + "\nEvent tertua: " + oldest
                    + "\nRetry berikutnya: " + nextRetry
                    + "\nPercobaan tertinggi: " + queue.highestAttemptCount
                    + "\nKode error terakhir: " + (queue.lastErrorCode == null ? "-" : queue.lastErrorCode)
                    + "\n\n" + BridgeConfig.senderState(this)
                    + "\n\n" + BridgeConfig.queueState(this)
            );
        }));
    }

    private boolean notificationAccessEnabled() {
        ComponentName component = new ComponentName(this, DanaNotificationListener.class);
        String listeners = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return listeners != null && listeners.contains(component.flattenToString());
    }

    private void openAppInfo() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getPackageName()));
        startActivity(intent);
    }

    private void openNotificationAccess() {
        try {
            startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
        } catch (Exception error) {
            Intent specialAccess = new Intent(Settings.ACTION_SETTINGS);
            startActivity(specialAccess);
        }
    }

    private void reconnectListener() {
        if (!notificationAccessEnabled()) {
            toast("Aktifkan akses notifikasi terlebih dahulu.");
            openNotificationAccess();
            return;
        }
        ComponentName component = new ComponentName(this, DanaNotificationListener.class);
        android.service.notification.NotificationListenerService.requestRebind(component);
        BridgeConfig.listenerState(this, "Permintaan reconnect dikirim. Tutup lalu buka kembali aplikasi untuk memeriksa status.");
        toast("Listener sedang dihubungkan ulang.");
        refreshStatus();
    }

    private void openBatteryOptimization() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(getPackageName())) {
                Intent request = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                request.setData(Uri.parse("package:" + getPackageName()));
                startActivity(request);
                return;
            }
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        } catch (Exception error) {
            openAppInfo();
        }
    }

    private void copyDeviceId(String deviceId) {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (clipboard == null) {
            toast("Clipboard tidak tersedia.");
            return;
        }
        clipboard.setPrimaryClip(ClipData.newPlainText("Device ID bridge", deviceId));
        toast("Device ID disalin.");
    }

    private TextView label(String value) {
        TextView label = text(value, 14, Color.rgb(18, 52, 59));
        label.setPadding(0, dp(18), 0, dp(6));
        return label;
    }

    private EditText input(String hint, int inputType) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setInputType(inputType);
        input.setSingleLine(true);
        input.setTextSize(14);
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        input.setBackgroundColor(Color.WHITE);
        return input;
    }

    private Button button(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(Color.rgb(18, 52, 59));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52));
        params.setMargins(0, dp(10), 0, 0);
        button.setLayoutParams(params);
        return button;
    }

    private TextView text(String value, int size, int color) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(color);
        return text;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String value) {
        Toast.makeText(this, value, Toast.LENGTH_LONG).show();
    }
}
