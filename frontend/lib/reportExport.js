import { resolvePhotoUrl } from '@/lib/photoUrl';

/** Portrait photo size matching PassCard (86×106 CSS px). */
const PASS_PHOTO_WIDTH = 86;
const PASS_PHOTO_HEIGHT = 106;
const PASS_PHOTO_PDF_WIDTH = 65;
const PASS_PHOTO_PDF_HEIGHT = 80;

function safeFilePart(value) {
  return String(value || 'report')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function eventTypeLabel(entry) {
  const type = (entry.eventType || '').toLowerCase();
  if (type.includes('entry')) return 'Entry';
  if (type.includes('exit')) return 'Exit';
  return entry.eventType || '—';
}

function scanTypeLabel(entry) {
  return entry.scanType === 'department' ? 'Department' : 'Gate';
}

function locationLabel(entry) {
  if (entry.scanType === 'department') {
    return entry.departmentName || entry.label || '—';
  }
  return entry.gateName || entry.label || '—';
}

function formatExportDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatExportTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatExportDateTime(value) {
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

function calcExportDuration(entryAt, exitAt) {
  if (!entryAt) return '—';
  const end = exitAt ? new Date(exitAt) : new Date();
  const ms = end - new Date(entryAt);
  if (ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function excelImageExtension(format) {
  return format === 'PNG' ? 'png' : 'jpeg';
}

async function loadImageElement(url, useCrossOrigin = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCrossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function imageElementToJpeg(img) {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error('Invalid image dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    format: 'JPEG',
  };
}

/**
 * Loads holder photo as a data URL for PDF/Excel embedding.
 * Uses the same URL resolution as the registration pass card.
 */
export async function loadPhotoForExport(photoPath) {
  const url = resolvePhotoUrl(photoPath);
  if (!url) return null;

  const attempts = [
    () => loadImageElement(url, true).then(imageElementToJpeg),
    () => loadImageElement(url, false).then(imageElementToJpeg),
    async () => {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Photo fetch failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await loadImageElement(objectUrl, false);
        return imageElementToJpeg(img);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result?.dataUrl) return result;
    } catch {
      // try next strategy
    }
  }

  return null;
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function collectReportEntries(reportData, { dateFrom = '', dateTo = '' } = {}) {
  const hasDateRange = Boolean(dateFrom && dateTo);
  const rows = [];

  if (hasDateRange) {
    const periodDays = (reportData?.attendanceRange?.days || []).filter((day) => day.status === 'P');
    const entriesByDateMap = Object.fromEntries(
      (reportData?.entriesByDate || []).map((group) => [group.date, group.entries])
    );

    for (const day of periodDays) {
      const entries = entriesByDateMap[day.date] || [];
      for (const entry of entries) {
        rows.push({
          ...entry,
          date: day.date,
          dayStatus: day.code || day.status,
          dayCheckIn: day.checkIn,
        });
      }
    }
  } else {
    const seen = new Set();
    const pushUnique = (entry, date) => {
      const key = entry.id || `${date}-${entry.at || entry.entryAt}-${entry.label}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ ...entry, date: date || entry.date });
    };

    const today = new Date().toISOString().slice(0, 10);
    for (const entry of reportData?.todayEntries || []) {
      pushUnique(entry, today);
    }
    for (const group of reportData?.entriesByDate || []) {
      for (const entry of group.entries || []) {
        pushUnique(entry, group.date);
      }
    }
  }

  return rows.sort((a, b) => new Date(b.at || b.entryAt || 0) - new Date(a.at || a.entryAt || 0));
}

function buildSummaryRows(reportData, { dateFrom = '', dateTo = '' } = {}, { includeIdentity = true } = {}) {
  const details = reportData?.details || {};
  const session = reportData?.sessionState || {};
  const hasDateRange = Boolean(dateFrom && dateTo);
  const rangeSummary = reportData?.attendanceRange?.summary;

  const rows = [];

  if (includeIdentity) {
    rows.push(
      ['Name', details.holderName || '—'],
      ['Role', details.roleName || '—'],
      ['Registration Code', details.registrationCode || '—']
    );
  }

  rows.push(
    ['Registered On', formatExportDateTime(details.registeredAt)],
    ['Last Scan', formatExportDateTime(details.lastScanAt)],
    ['Total Scans', details.totalScans ?? '—'],
    ['Divisions Visited', (details.divisionsVisited || []).join(', ') || '—'],
    ['Shift', details.shiftName || '—']
  );

  if (hasDateRange) {
    rows.push(
      ['Report Period', `${formatExportDate(dateFrom)} — ${formatExportDate(dateTo)}`],
      ['Present Days', rangeSummary?.present ?? '—'],
      ['Absent Days', rangeSummary?.absent ?? '—'],
      ['Total Days', rangeSummary?.totalDays ?? '—']
    );
  } else {
    rows.push(
      ['In Time', formatExportTime(session?.gateEntryAt)],
      ['Out Time', formatExportTime(session?.gateExitAt)],
      ['Duration', calcExportDuration(session?.gateEntryAt, session?.gateExitAt)],
      ['Active Department', session?.currentDepartmentName || '—']
    );
  }

  for (const item of details.details || []) {
    rows.push([item.label, item.value || '—']);
  }

  return rows;
}

function buildEventRows(entries) {
  return entries.map((entry) => {
    const at = entry.at || entry.entryAt;
    return [
      formatExportDate(entry.date || at),
      formatExportTime(at),
      eventTypeLabel(entry),
      scanTypeLabel(entry),
      locationLabel(entry),
      entry.divisionName || '—',
      entry.departmentName || '—',
      entry.matchScore != null ? `${Math.round(entry.matchScore * 100)}%` : '—',
      entry.label || '—',
    ];
  });
}

function buildFileBaseName(reportData) {
  const code = reportData?.details?.registrationCode || 'person';
  const name = reportData?.details?.holderName || 'report';
  const stamp = new Date().toISOString().slice(0, 10);
  return safeFilePart(`SAMS_${code}_${name}_${stamp}`);
}

export function buildPersonReportExport(reportData, options = {}) {
  const entries = collectReportEntries(reportData, options);
  const summaryRows = buildSummaryRows(reportData, options);
  const eventRows = buildEventRows(entries);
  const fileBaseName = buildFileBaseName(reportData);

  return {
    fileBaseName,
    summaryRows,
    eventRows,
    entries,
    title: `SAMS Access Report — ${reportData?.details?.holderName || 'Person'}`,
    holderPhotoUrl: reportData?.details?.holderPhotoUrl || null,
    details: reportData?.details || {},
  };
}

function drawPdfPassPhotoHeader(doc, details, photo, margin, startY) {
  const photoX = margin;
  const photoY = startY;
  const textX = margin + PASS_PHOTO_PDF_WIDTH + 14;

  if (photo?.dataUrl) {
    const imageData = photo.dataUrl.includes(',') ? photo.dataUrl.split(',')[1] : photo.dataUrl;
    doc.addImage(imageData, 'JPEG', photoX, photoY, PASS_PHOTO_PDF_WIDTH, PASS_PHOTO_PDF_HEIGHT);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(1);
    doc.rect(photoX, photoY, PASS_PHOTO_PDF_WIDTH, PASS_PHOTO_PDF_HEIGHT);
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(229, 231, 235);
    doc.rect(photoX, photoY, PASS_PHOTO_PDF_WIDTH, PASS_PHOTO_PDF_HEIGHT, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('No photo', photoX + PASS_PHOTO_PDF_WIDTH / 2, photoY + PASS_PHOTO_PDF_HEIGHT / 2, {
      align: 'center',
    });
    doc.setTextColor(0);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(details.holderName || '—', textX, photoY + 18);

  doc.setFontSize(10);
  doc.setTextColor(37, 99, 235);
  doc.text((details.roleName || '—').toUpperCase(), textX, photoY + 34);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(details.registrationCode || '—', textX, photoY + 48);
  doc.setTextColor(0);

  return photoY + PASS_PHOTO_PDF_HEIGHT + 18;
}

export async function downloadPersonReportExcel(reportData, options = {}) {
  const ExcelJS = (await import('exceljs')).default;
  const payload = buildPersonReportExport(reportData, options);
  const photo = await loadPhotoForExport(payload.holderPhotoUrl);
  const details = payload.details;
  const summaryRows = buildSummaryRows(reportData, options, { includeIdentity: false });

  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet('Summary');

  summarySheet.mergeCells('A1:B1');
  summarySheet.getCell('A1').value = 'SAMS — Individual Access Report';
  summarySheet.getCell('A1').font = { bold: true, size: 14 };

  summarySheet.getCell('A2').value = 'Generated At';
  summarySheet.getCell('B2').value = formatExportDateTime(new Date());

  summarySheet.getColumn(1).width = 14;
  summarySheet.getColumn(2).width = 18;
  summarySheet.getColumn(3).width = 24;
  summarySheet.getColumn(4).width = 42;

  const profileStartRow = 4;
  summarySheet.mergeCells(`A${profileStartRow}:B${profileStartRow + 3}`);
  summarySheet.getRow(profileStartRow).height = 22;
  summarySheet.getRow(profileStartRow + 1).height = 22;
  summarySheet.getRow(profileStartRow + 2).height = 22;
  summarySheet.getRow(profileStartRow + 3).height = 22;

  if (photo?.dataUrl) {
    const base64 = photo.dataUrl.split(',')[1];
    const imageId = workbook.addImage({
      base64,
      extension: excelImageExtension(photo.format),
    });
    summarySheet.addImage(imageId, {
      tl: { col: 0, row: profileStartRow - 1 },
      ext: { width: PASS_PHOTO_WIDTH, height: PASS_PHOTO_HEIGHT },
    });
  } else {
    summarySheet.getCell(`A${profileStartRow}`).value = 'No photo';
    summarySheet.getCell(`A${profileStartRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getCell(`A${profileStartRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };
    summarySheet.getCell(`B${profileStartRow}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF8FAFC' },
    };
  }

  summarySheet.getCell(`C${profileStartRow}`).value = details.holderName || '—';
  summarySheet.getCell(`C${profileStartRow}`).font = { bold: true, size: 14 };
  summarySheet.getCell(`C${profileStartRow + 1}`).value = details.roleName || '—';
  summarySheet.getCell(`C${profileStartRow + 1}`).font = { bold: true, color: { argb: 'FF2563EB' } };
  summarySheet.getCell(`C${profileStartRow + 2}`).value = details.registrationCode || '—';
  summarySheet.getCell(`C${profileStartRow + 2}`).font = { color: { argb: 'FF64748B' } };

  const tableStartRow = profileStartRow + 6;
  summarySheet.getCell(`A${tableStartRow}`).value = 'Field';
  summarySheet.getCell(`B${tableStartRow}`).value = 'Value';
  summarySheet.getRow(tableStartRow).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A56FF' },
  };
  summarySheet.getRow(tableStartRow).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  summaryRows.forEach((row, index) => {
    const excelRow = tableStartRow + 1 + index;
    summarySheet.getCell(`A${excelRow}`).value = row[0];
    summarySheet.getCell(`B${excelRow}`).value = row[1];
    summarySheet.getCell(`A${excelRow}`).font = { bold: true };
  });

  const eventsSheet = workbook.addWorksheet('Activity');
  eventsSheet.addRow([
    'Date',
    'Time',
    'Event',
    'Scan Type',
    'Location',
    'Division',
    'Department',
    'Match Score',
    'Description',
  ]);
  eventsSheet.getRow(1).font = { bold: true };
  eventsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A56FF' },
  };
  eventsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const row of payload.eventRows) {
    eventsSheet.addRow(row);
  }

  eventsSheet.columns = [
    { width: 14 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 28 },
    { width: 22 },
    { width: 22 },
    { width: 12 },
    { width: 36 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  triggerBlobDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${payload.fileBaseName}.xlsx`
  );
}

export async function downloadPersonReportPdf(reportData, options = {}) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;
  const payload = buildPersonReportExport(reportData, options);
  const photo = await loadPhotoForExport(payload.holderPhotoUrl);
  const summaryRows = buildSummaryRows(reportData, options, { includeIdentity: false });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SAMS — Individual Access Report', margin, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Generated: ${formatExportDateTime(new Date())}`, margin, 66);
  doc.setTextColor(0);

  const tableStartY = drawPdfPassPhotoHeader(doc, payload.details, photo, margin, 82);

  autoTable(doc, {
    startY: tableStartY,
    head: [['Field', 'Value']],
    body: summaryRows,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [26, 86, 255], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 130, fontStyle: 'bold' },
      1: { cellWidth: pageWidth - margin * 2 - 130 },
    },
    margin: { left: margin, right: margin },
  });

  const activityStartY = (doc.lastAutoTable?.finalY || tableStartY + 40) + 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Activity History', margin, activityStartY);

  autoTable(doc, {
    startY: activityStartY + 10,
    head: [['Date', 'Time', 'Event', 'Type', 'Location', 'Division', 'Department', 'Match']],
    body: payload.eventRows.length
      ? payload.eventRows.map((row) => row.slice(0, 8))
      : [['—', '—', '—', '—', 'No activity found', '—', '—', '—']],
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [26, 86, 255], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 42 },
      2: { cellWidth: 38 },
      3: { cellWidth: 42 },
      4: { cellWidth: 88 },
      5: { cellWidth: 68 },
      6: { cellWidth: 68 },
      7: { cellWidth: 38 },
    },
    margin: { left: margin, right: margin },
  });

  doc.save(`${payload.fileBaseName}.pdf`);
}
