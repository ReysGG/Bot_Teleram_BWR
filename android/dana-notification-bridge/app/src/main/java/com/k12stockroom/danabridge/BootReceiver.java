package com.k12stockroom.danabridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Menghidupkan kembali bridge otomatis setelah HP restart. */
public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        BridgeForegroundService.start(context);
    }
}
