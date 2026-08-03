export const deviceStatusOptions = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'blocked',  label: 'Blocked' },
];

const VARIANT = {
  pending:  'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
  blocked:  'badge-danger',
};

const LABEL = {
  pending:  'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  blocked:  'Blocked',
};

export default function DeviceStatusBadge({ status }) {
  return (
    <span className={`badge ${VARIANT[status] ?? 'badge-secondary'}`}>
      {LABEL[status] ?? status ?? '—'}
    </span>
  );
}
