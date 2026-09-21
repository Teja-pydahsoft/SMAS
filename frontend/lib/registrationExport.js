import { formatDate } from '@/lib/formatDate';
import { api } from '@/lib/api/client';

export async function downloadRegistrationsExcel(filters, { fields }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Registrations');

  const baseColumns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Role', key: 'role', width: 20 },
    { header: 'Code', key: 'code', width: 20 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Stage', key: 'stage', width: 15 },
    { header: 'Pass Issued', key: 'pass', width: 15 },
    { header: 'Date', key: 'date', width: 20 }
  ];

  const dynamicFields = [];
  if (fields && fields.length > 0) {
    fields.forEach((f, idx) => {
      const lowerLabel = f.label.toLowerCase();
      if (lowerLabel === 'name') return;
      
      const colKey = `dyn_${idx}`;
      baseColumns.push({ header: f.label, key: colKey, width: 20 });
      dynamicFields.push({ key: colKey, label: f.label });
    });
  }

  ws.columns = baseColumns;
  ws.getRow(1).font = { bold: true };

  try {
    const data = await api.registrations.list(filters);
    const items = Array.isArray(data) ? data : (data?.items || []);

    items.forEach(reg => {
      const row = {
        name: reg.displayName || '—',
        role: reg.roleId?.name || '—',
        code: reg.registrationCode || '—',
        status: reg.status.replace(/_/g, ' '),
        stage: reg.currentStage || '—',
        pass: reg.hasRegistrationPass ? 'Yes' : 'No',
        date: formatDate(reg.createdAt)
      };

      if (dynamicFields.length > 0 && reg.formDetails) {
        dynamicFields.forEach(df => {
          const det = reg.formDetails.find(d => d.label === df.label);
          row[df.key] = det ? (det.value || '—') : '—';
        });
      }

      ws.addRow(row);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Registrations_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed', error);
    throw error;
  }
}
