import { formatPayFrequency } from '@/lib/payFrequency';

const BRAND = [30, 64, 175];

function formatPdfCurrency(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const num = Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Rs ${num}`;
}

function formatPdfDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPdfDateLong(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPdfTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatPdfDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calcPdfDuration(entryAt, exitAt) {
  if (!entryAt) return '—';
  const end = exitAt ? new Date(exitAt) : new Date();
  const ms = end - new Date(entryAt);
  if (ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function dayStatusLabel(person) {
  if (person.divisionInside) return 'Inside';
  if (person.hadActivityToday) return 'Checked Out';
  return 'Not In';
}

function exitTimeLabel(person) {
  if (person.gateExitAt) return formatPdfTime(person.gateExitAt);
  if (person.divisionInside) return 'Active';
  return '—';
}

function safeFilePart(value) {
  return String(value || 'report')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);
}

function drawReportHeader(doc, { title, subtitle, pageWidth, margin, headerH }) {
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, margin, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, margin, 34);
  doc.setTextColor(0, 0, 0);
}

function drawFooters(doc, { margin, pageHeight, footerLeft }) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(footerLeft, margin, pageHeight - 12);
    doc.text(`Page ${p} of ${pageCount}`, doc.internal.pageSize.getWidth() - margin, pageHeight - 12, {
      align: 'right',
    });
  }
}

/**
 * Today's Activity / Daily Attendance — professional PDF table
 * Columns: Person, Role, Code, Entry Time, Exit Time, Duration, Status, Shift
 */
export async function downloadDailyAttendancePdf(people = [], options = {}) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;
  const reportDate = options.date ? new Date(options.date) : new Date();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const headerH = 48;
  const footerReserve = 28;

  drawReportHeader(doc, {
    title: 'SAMS — Day Report',
    subtitle: `Daily Attendance  ·  ${formatPdfDateLong(reportDate)}  ·  Generated ${formatPdfDateTime(new Date())}`,
    pageWidth,
    margin,
    headerH,
  });

  const body = (Array.isArray(people) ? people : []).map((p) => [
    p.displayName || 'Unnamed',
    p.roleName || '—',
    p.registrationCode || '—',
    formatPdfTime(p.gateEntryAt),
    exitTimeLabel(p),
    calcPdfDuration(p.gateEntryAt, p.gateExitAt || (p.divisionInside ? new Date() : null)),
    dayStatusLabel(p),
    p.shiftName || '—',
  ]);

  autoTable(doc, {
    startY: headerH + 14,
    head: [['Person', 'Role', 'Code', 'Entry Time', 'Exit Time', 'Duration', 'Status', 'Shift']],
    body: body.length
      ? body
      : [['No attendance records for this day.', '', '', '', '', '', '', '']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      overflow: 'ellipsize',
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.3,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: BRAND,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 110 },
      1: { cellWidth: 80 },
      2: { cellWidth: 90 },
      3: { cellWidth: 70 },
      4: { cellWidth: 70 },
      5: { cellWidth: 60 },
      6: { cellWidth: 75 },
      7: { cellWidth: 80 },
    },
    didParseCell(data) {
      if (data.section !== 'body' || data.column.index !== 6) return;
      const status = String(data.cell.raw || '');
      if (status === 'Inside') {
        data.cell.styles.textColor = [22, 163, 74];
        data.cell.styles.fontStyle = 'bold';
      } else if (status === 'Checked Out') {
        data.cell.styles.textColor = [37, 99, 235];
        data.cell.styles.fontStyle = 'bold';
      } else if (status === 'Not In') {
        data.cell.styles.textColor = [100, 116, 139];
      }
    },
    margin: { left: margin, right: margin, bottom: footerReserve },
  });

  drawFooters(doc, {
    margin,
    pageHeight,
    footerLeft: `SAMS Day Report · ${formatPdfDate(reportDate)} · ${body.length} people`,
  });

  doc.save(`SAMS_Day_Report_${safeFilePart(reportDate.toISOString().slice(0, 10))}.pdf`);
}

/**
 * Attendance History — professional PDF abstract table
 * Columns: #, Person, Role, ID, Phone, Total Days, Present, Absent,
 *          Pay Frequency, Pay Amount (per day), Payment Days, Calculated Amount
 */
export async function downloadAttendanceHistoryPdf(employees = [], options = {}) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;
  const { dateFrom = '', dateTo = '' } = options;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 22;
  const headerH = 48;
  const footerReserve = 28;

  const periodLabel =
    dateFrom && dateTo
      ? `${formatPdfDate(dateFrom)} — ${formatPdfDate(dateTo)}`
      : 'Selected period';

  drawReportHeader(doc, {
    title: 'SAMS — Attendance History Report',
    subtitle: `Period: ${periodLabel}  ·  Generated ${formatPdfDateTime(new Date())}`,
    pageWidth,
    margin,
    headerH,
  });

  const list = Array.isArray(employees) ? employees : [];
  const body = list.map((emp, idx) => [
    String(idx + 1),
    emp.displayName || 'Unnamed',
    emp.roleName || '—',
    emp.registrationCode || '—',
    emp.displayPhone || '—',
    String(emp.summary?.totalDays ?? '—'),
    String(emp.summary?.present ?? '—'),
    String(emp.summary?.halfDay ?? 0),
    String(emp.summary?.absent ?? '—'),
    emp.payFrequencyLabel ||
      formatPayFrequency(emp.payFrequency, emp.customPayDays) ||
      '—',
    emp.payAmount != null ? formatPdfCurrency(emp.payAmount) : '—',
    emp.payment?.paymentDays != null ? String(emp.payment.paymentDays) : '—',
    emp.payment ? formatPdfCurrency(emp.payment.totalAmount) : '—',
  ]);

  autoTable(doc, {
    startY: headerH + 12,
    head: [[
      '#',
      'Person',
      'Role',
      'ID',
      'Phone',
      'Total Days',
      'Present Days',
      'Partial Days',
      'Absent Days',
      'Pay Frequency',
      'Pay Amount (per day)',
      'Payment Days',
      'Calculated Amount',
    ]],
    body: body.length
      ? body
      : [['No attendance history for this period.', '', '', '', '', '', '', '', '', '', '', '', '']],
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
      overflow: 'ellipsize',
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.25,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: BRAND,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 6.5,
      halign: 'left',
      cellPadding: { top: 4, bottom: 4, left: 2.5, right: 2.5 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 70 },
      2: { cellWidth: 52 },
      3: { cellWidth: 62 },
      4: { cellWidth: 58 },
      5: { cellWidth: 36, halign: 'right' },
      6: { cellWidth: 42, halign: 'right' },
      7: { cellWidth: 36, halign: 'right' },
      8: { cellWidth: 42, halign: 'right' },
      9: { cellWidth: 58 },
      10: { cellWidth: 64, halign: 'right' },
      11: { cellWidth: 44, halign: 'right' },
      12: { cellWidth: 68, halign: 'right' },
    },
    didParseCell(data) {
      if (data.section !== 'body') return;
      if (data.column.index === 6 || data.column.index === 7) {
        data.cell.styles.textColor = [22, 163, 74];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 8) {
        data.cell.styles.textColor = [220, 38, 38];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 12 && data.cell.raw && data.cell.raw !== '—') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [15, 118, 110];
      }
    },
    margin: { left: margin, right: margin, bottom: footerReserve },
  });

  drawFooters(doc, {
    margin,
    pageHeight,
    footerLeft: `SAMS Attendance History · ${periodLabel} · ${body.length} people`,
  });

  const fromPart = dateFrom || 'range';
  const toPart = dateTo || 'end';
  doc.save(`SAMS_Attendance_History_${safeFilePart(fromPart)}_${safeFilePart(toPart)}.pdf`);
}
