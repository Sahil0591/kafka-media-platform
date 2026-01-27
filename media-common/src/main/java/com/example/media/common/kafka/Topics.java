package com.example.media.common.kafka;

public final class Topics {
    private Topics() {}

    public static final String MEDIA_UPLOADED = "media.uploaded";
    public static final String MEDIA_TRANSCODE_PROGRESS = "media.transcode.progress";
    public static final String MEDIA_PROCESSED = "media.processed";
    public static final String MEDIA_FAILED = "media.failed";
}
