'use client';
import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { api, post } from '@/lib/api';
import { useData } from '@/lib/use-data';
import { Button, Modal, State } from './ui';
export function AdmissionUpload({
  applicationId,
  token,
}: {
  applicationId: string;
  token: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function upload(file: File) {
    setMessage('');
    if (file.size > 5_000_000) {
      setMessage('Please choose a file smaller than 5 MB.');
      return;
    }
    setBusy(true);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await post(`admissions/applications/${applicationId}/documents`, {
        token,
        fileName: file.name,
        mimeType: file.type,
        content,
      });
      setMessage(`${file.name} uploaded securely.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-grid" style={{ textAlign: 'left', width: '100%' }}>
      <h3>Supporting documents</h3>
      <p>
        Attach a birth certificate or previous report card. PDF, PNG or JPEG; up to 5 MB each,
        maximum five files. Files are encrypted at rest.
      </p>
      <label>
        Choose a document
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
            e.target.value = '';
          }}
        />
      </label>
      {message && <p role="status">{message}</p>}
      {busy && <p role="status">Encrypting and uploading…</p>}
    </div>
  );
}
export function AdmissionDocuments({
  applicationId,
  onClose,
}: {
  applicationId: string;
  onClose: () => void;
}) {
  const { data, error, loading } = useData(`admissions/applications/${applicationId}/documents`);
  return (
    <Modal title="Application documents" onClose={onClose}>
      {loading || error || !data?.length ? (
        <State loading={loading} error={error} empty={!data?.length} />
      ) : (
        <div className="form-grid">
          {data.map((d: any) => (
            <a className="button secondary" href={d.url} key={d.id}>
              <Download size={16} />
              {d.fileName} · {Math.ceil(d.size / 1024)} KB
            </a>
          ))}
          <p>Download links expire after five minutes.</p>
        </div>
      )}
    </Modal>
  );
}
