export const STATUS_BADGE = {
  draft: 'badge-info',
  in_progress: 'badge-info',
  pending_verification: 'badge-warning',
  verified: 'badge-success',
  rejected: 'badge-danger',
};

export function actionLabel(reg) {
  if (reg.status === 'verified') return 'Edit';
  if (reg.status === 'rejected') return 'Update';
  if (reg.status === 'pending_verification' || reg.currentStage === 'review') return 'Review';
  return 'Continue';
}

export function photoUrlFromPath(photoPath) {
  if (!photoPath) return null;
  const name = photoPath.replace(/\\/g, '/').split('/').pop();
  return `/uploads/registrations/${name}`;
}
