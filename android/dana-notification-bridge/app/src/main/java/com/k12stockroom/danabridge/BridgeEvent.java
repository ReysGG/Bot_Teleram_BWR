package com.k12stockroom.danabridge;

import org.json.JSONException;
import org.json.JSONObject;

final class BridgeEvent {
    final String eventId;
    final String deviceId;
    final String packageName;
    final String title;
    final String body;
    final String postedAt;

    BridgeEvent(String eventId, String deviceId, String packageName, String title, String body, String postedAt) {
        this.eventId = eventId;
        this.deviceId = deviceId;
        this.packageName = packageName;
        this.title = title;
        this.body = body;
        this.postedAt = postedAt;
    }

    String toJson() throws JSONException {
        return new JSONObject()
            .put("eventId", eventId)
            .put("deviceId", deviceId)
            .put("packageName", packageName)
            .put("title", title)
            .put("body", body)
            .put("postedAt", postedAt)
            .toString();
    }

    static BridgeEvent fromJson(JSONObject value) {
        String eventId = value.optString("eventId", "");
        String deviceId = value.optString("deviceId", "");
        String packageName = value.optString("packageName", "");
        String postedAt = value.optString("postedAt", "");
        if (eventId.isEmpty() || deviceId.isEmpty() || packageName.isEmpty() || postedAt.isEmpty()) return null;
        return new BridgeEvent(
            eventId,
            deviceId,
            packageName,
            value.optString("title", ""),
            value.optString("body", ""),
            postedAt
        );
    }
}
