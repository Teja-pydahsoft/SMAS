'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import PassVerifyView from '@/components/PassVerifyView';

export default function PassVerifyPage() {
  const params = useParams();
  const passCode = decodeURIComponent(params.passCode || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!passCode) {
      setError('Invalid pass code');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    api.passes
      .verify(passCode)
      .then(setData)
      .catch((e) => setError(e.message || 'Could not verify pass'))
      .finally(() => setLoading(false));
  }, [passCode]);

  return (
    <div className="pass-verify-page">
      {loading && <p className="pass-verify-page__status">Verifying pass...</p>}
      {error && !loading && (
        <div className="card pass-verify-page__error">
          <h1>Pass not found</h1>
          <p>{error}</p>
        </div>
      )}
      {!loading && !error && data && <PassVerifyView data={data} />}
    </div>
  );
}
