export interface PreviewRequest {
  source: { path: string; size: number; modifiedAt: number }
  width: number
  height: number
  purpose: 'thumbnail' | 'detail'
}
