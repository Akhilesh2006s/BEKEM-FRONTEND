import { api } from '@/lib/api';

async function fetchPdfBlob(path: string) {
  const res = await api.get(path, { responseType: 'blob' });
  return new Blob([res.data], { type: 'application/pdf' });
}

export async function downloadExport(path: string, filename: string) {
  const blob = await fetchPdfBlob(path);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Open the PDF in a new browser tab without forcing a download. */
export async function viewExport(path: string) {
  const blob = await fetchPdfBlob(path);
  const url = window.URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.URL.revokeObjectURL(url);
    throw new Error('Popup blocked — allow popups to view PDF');
  }
  // Keep the blob URL alive long enough for the tab to load the PDF.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 120_000);
}
