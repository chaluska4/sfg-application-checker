export interface ReviewBlobReviewRequest {
  blobName: string;
  originalFilename: string;
}

export interface UploadUrlRequest {
  filename: string;
  contentType: string;
  size: number;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  blobName: string;
}

export interface UploadConfigResponse {
  blobStorageConfigured: boolean;
  directUploadMaxBytes: number;
}
