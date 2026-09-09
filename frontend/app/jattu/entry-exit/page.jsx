'use client';

import EntryExitPageContent from '@/components/EntryExitWorkspace';

export default function JattuEntryExitPage() {
  return (
    <EntryExitPageContent
      basePath="/jattu/entry-exit"
      allowedScanTypes={['gate']}
      allowOpenSelector
      pageTitle="JATTU Entry & Exit"
      pageDescription="Division gate entry and exit for JATTU — show a Registration Pass QR or capture a face"
      unlockedDescription="Select a division gate, then scan. Department check-in is not used for JATTU."
    />
  );
}
