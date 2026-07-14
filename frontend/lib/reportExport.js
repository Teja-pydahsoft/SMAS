import { resolvePhotoUrl } from '@/lib/photoUrl';
import { formatCurrency, formatPayFrequency } from '@/lib/payFrequency';

/** Portrait photo size matching PassCard (86×106 CSS px). */
const PASS_PHOTO_WIDTH = 86;
const PASS_PHOTO_HEIGHT = 106;
const PASS_PHOTO_PDF_WIDTH = 65;
const PASS_PHOTO_PDF_HEIGHT = 80;

/** Scan photo size matching report timeline (72×72 CSS px). */
const SCAN_PHOTO_WIDTH = 72;
const SCAN_PHOTO_HEIGHT = 72;
const SCAN_PHOTO_ROW_HEIGHT = 58;

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

function addUtcDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function eachDateInRange(dateFrom, dateTo) {
  const dates = [];
  let cur = dateFrom;
  while (cur <= dateTo) {
    dates.push(cur);
    cur = addUtcDays(cur, 1);
  }
  return dates;
}

function countRangeDays(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return 0;
  return eachDateInRange(dateFrom, dateTo).length;
}

function formatShortDate(value) {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function dayStatusLabel(day) {
  if (!day || day.status === 'blank') return 'Not Registered';
  if (day.status === 'P') return 'Present';
  if (day.status === 'A') return 'Absent';
  return day.label || day.code || '—';
}

function dayAmount(day, rate) {
  if (!day || day.status === 'blank') return '—';
  if (day.status === 'P') return formatCurrency(Number(rate) || 0);
  return formatCurrency(0);
}

function buildAttendanceBodyRow(date, day, rate) {
  if (!day || day.status === 'blank') {
    return [formatShortDate(date), 'Not Registered', '—'];
  }
  return [formatShortDate(date), dayStatusLabel(day), dayAmount(day, rate)];
}

/**
 * Split a date range into week chunks for PDF tables.
 * - ≤7 days → single week table
 * - ~month (28–31) → exactly 4 weeks side-by-side
 * - longer/custom → evenly divided week tables
 */
function splitRangeIntoWeekChunks(dateFrom, dateTo) {
  const dates = eachDateInRange(dateFrom, dateTo);
  const dayCount = dates.length;
  if (dayCount === 0) return [];

  if (dayCount <= 7) {
    return [
      {
        label: 'Week 1',
        rangeLabel: `${formatShortDate(dates[0])} – ${formatShortDate(dates[dates.length - 1])}`,
        dates,
      },
    ];
  }

  const weekCount =
    dayCount >= 28 && dayCount <= 31 ? 4 : Math.max(2, Math.ceil(dayCount / 7));
  const size = Math.ceil(dayCount / weekCount);
  const chunks = [];

  for (let i = 0; i < weekCount; i += 1) {
    const slice = dates.slice(i * size, (i + 1) * size);
    if (!slice.length) continue;
    chunks.push({
      label: `Week ${i + 1}`,
      rangeLabel: `${formatShortDate(slice[0])} – ${formatShortDate(slice[slice.length - 1])}`,
      dates: slice,
    });
  }

  return chunks;
}

function buildPersonDetailRows(reportData, options = {}) {
  const details = reportData?.details || {};
  const { dateFrom = '', dateTo = '' } = options;
  const rows = [
    ['Name', details.holderName || '—'],
    ['Role', details.roleName || '—'],
    ['Code', details.registrationCode || '—'],
    ['Gender', details.genderLabel || '—'],
    ['Registered', formatExportDate(details.registeredAt)],
  ];
  if (dateFrom && dateTo) {
    rows.push(['Period', `${formatExportDate(dateFrom)} — ${formatExportDate(dateTo)}`]);
  }
  return rows;
}

function buildPayDetailRows(reportData, options = {}) {
  const details = reportData?.details || {};
  const payment = reportData?.attendanceRange?.payment || null;
  const summary = reportData?.attendanceRange?.summary || null;
  const payFrequency = payment?.payFrequency || details.payFrequency || null;
  const customPayDays = payment?.customPayDays || details.customPayDays || null;
  const rate = payment?.payAmount ?? details.payAmount ?? null;
  const hasRange = Boolean(options.dateFrom && options.dateTo);

  return [
    [
      'Pay Frequency',
      payment?.payFrequencyLabel || formatPayFrequency(payFrequency, customPayDays),
    ],
    ['Per Day Amount', rate != null ? formatCurrency(rate) : '—'],
    ['Present Days', hasRange ? String(payment?.paymentDays ?? summary?.present ?? 0) : '—'],
    ['Absent Days', hasRange ? String(summary?.absent ?? 0) : '—'],
    ['Calculated Amount', payment ? formatCurrency(payment.totalAmount) : '—'],
  ];
}

function buildAttendanceWeekTables(reportData, { dateFrom = '', dateTo = '' } = {}) {
  if (!dateFrom || !dateTo) {
    return {
      mode: 'empty',
      title: 'Attendance',
      weeks: [],
    };
  }

  const days = reportData?.attendanceRange?.days || [];
  const dayByDate = Object.fromEntries(days.map((day) => [day.date, day]));
  const rate =
    reportData?.attendanceRange?.payment?.payAmount ??
    reportData?.details?.payAmount ??
    0;
  const chunks = splitRangeIntoWeekChunks(dateFrom, dateTo);
  const dayCount = countRangeDays(dateFrom, dateTo);

  const weeks = chunks.map((chunk) => ({
    label: chunk.label,
    rangeLabel: chunk.rangeLabel,
    head: [['Date', 'Status', 'Amount']],
    body: chunk.dates.map((date) => {
      const day = dayByDate[date];
      return buildAttendanceBodyRow(date, day, rate);
    }),
  }));

  // Pad so side-by-side week tables share the same row count / bottom edge
  const maxRows = Math.max(0, ...weeks.map((week) => week.body.length));
  for (const week of weeks) {
    while (week.body.length < maxRows) {
      week.body.push(['', '', '']);
    }
  }

  return {
    mode: dayCount <= 7 ? 'single' : 'multi',
    title:
      dayCount <= 7
        ? 'Attendance (Week)'
        : dayCount >= 28 && dayCount <= 31
          ? 'Attendance (Month — 4 Weeks)'
          : `Attendance (${weeks.length} Weeks)`,
    weeks,
  };
}

function excelImageExtension(format) {
  return format === 'PNG' ? 'png' : 'jpeg';
}

function getDayScanPhotos(entries) {
  if (!entries?.length) {
    return { checkInPhotoUrl: null, checkOutPhotoUrl: null };
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(a.at || a.entryAt || 0) - new Date(b.at || b.entryAt || 0)
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return {
    checkInPhotoUrl: first.photoUrl || null,
    checkOutPhotoUrl: sorted.length > 1 ? (last.photoUrl || null) : null,
  };
}

async function buildPhotoCache(urls) {
  const unique = [...new Set(urls.filter(Boolean))];
  const cache = new Map();

  await Promise.all(
    unique.map(async (url) => {
      const photo = await loadPhotoForExport(url);
      cache.set(url, photo);
    })
  );

  return cache;
}

function addExcelScanPhoto(workbook, sheet, photo, colIndex, rowIndex) {
  if (!photo?.dataUrl) return;

  const base64 = photo.dataUrl.split(',')[1];
  const imageId = workbook.addImage({
    base64,
    extension: excelImageExtension(photo.format),
  });

  sheet.addImage(imageId, {
    tl: { col: colIndex, row: rowIndex },
    ext: { width: SCAN_PHOTO_WIDTH, height: SCAN_PHOTO_HEIGHT },
  });
}

function styleExcelHeaderRow(sheet, rowNumber) {
  sheet.getRow(rowNumber).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A56FF' },
  };
  sheet.getRow(rowNumber).font = { bold: true, color: { argb: 'FFFFFFFF' } };
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
    ['Shift', details.shiftName || '—'],
    ['Pay Frequency', details.payFrequencyLabel || '—'],
    ['Gender', details.genderLabel || '—']
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
      entry.remark?.trim() ? entry.remark.trim() : '—',
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
  const hasDateRange = Boolean(options.dateFrom && options.dateTo);

  const periodDays = hasDateRange
    ? (reportData?.attendanceRange?.days || []).filter((day) => day.status === 'P')
    : [];
  const entriesByDateMap = Object.fromEntries(
    (reportData?.entriesByDate || []).map((group) => [group.date, group.entries || []])
  );

  const photoUrls = payload.entries.map((entry) => entry.photoUrl).filter(Boolean);
  for (const day of periodDays) {
    const dayPhotos = getDayScanPhotos(entriesByDateMap[day.date] || []);
    if (dayPhotos.checkInPhotoUrl) photoUrls.push(dayPhotos.checkInPhotoUrl);
    if (dayPhotos.checkOutPhotoUrl) photoUrls.push(dayPhotos.checkOutPhotoUrl);
  }
  const photoCache = await buildPhotoCache(photoUrls);

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
  styleExcelHeaderRow(summarySheet, tableStartRow);

  summaryRows.forEach((row, index) => {
    const excelRow = tableStartRow + 1 + index;
    summarySheet.getCell(`A${excelRow}`).value = row[0];
    summarySheet.getCell(`B${excelRow}`).value = row[1];
    summarySheet.getCell(`A${excelRow}`).font = { bold: true };
  });

  if (hasDateRange && periodDays.length > 0) {
    const periodSheet = workbook.addWorksheet('Period History');
    const periodHeaders = [
      'Date',
      'Status',
      'Check-In',
      'Check-In Photo',
      'Last Activity',
      'Activity Type',
      'Check-Out Photo',
      'Sessions',
    ];
    periodSheet.addRow(periodHeaders);
    styleExcelHeaderRow(periodSheet, 1);

    const sortedPeriodDays = [...periodDays].sort((a, b) => b.date.localeCompare(a.date));
    for (const day of sortedPeriodDays) {
      const entries = entriesByDateMap[day.date] || [];
      const { checkInPhotoUrl, checkOutPhotoUrl } = getDayScanPhotos(entries);
      const lastActivityLabel = day.lastActivityType === 'exit' ? 'Check-Out' : 'Check-In';
      const rowNumber = periodSheet.rowCount + 1;

      periodSheet.addRow([
        formatExportDate(day.date),
        day.code || day.status || '—',
        formatExportTime(day.checkIn),
        checkInPhotoUrl ? '' : '—',
        formatExportTime(day.lastActivityAt),
        lastActivityLabel,
        checkOutPhotoUrl ? '' : '—',
        entries.length,
      ]);

      periodSheet.getRow(rowNumber).height = SCAN_PHOTO_ROW_HEIGHT;
      addExcelScanPhoto(workbook, periodSheet, photoCache.get(checkInPhotoUrl), 3, rowNumber - 1);
      addExcelScanPhoto(workbook, periodSheet, photoCache.get(checkOutPhotoUrl), 6, rowNumber - 1);
    }

    periodSheet.columns = [
      { width: 14 },
      { width: 10 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 10 },
    ];
  }

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
    'Remark',
    'Photo',
  ]);
  styleExcelHeaderRow(eventsSheet, 1);

  for (const entry of payload.entries) {
    const at = entry.at || entry.entryAt;
    const rowNumber = eventsSheet.rowCount + 1;
    eventsSheet.addRow([
      formatExportDate(entry.date || at),
      formatExportTime(at),
      eventTypeLabel(entry),
      scanTypeLabel(entry),
      locationLabel(entry),
      entry.divisionName || '—',
      entry.departmentName || '—',
      entry.matchScore != null ? `${Math.round(entry.matchScore * 100)}%` : '—',
      entry.remark?.trim() ? entry.remark.trim() : '—',
      entry.photoUrl ? '' : '—',
    ]);
    eventsSheet.getRow(rowNumber).height = entry.photoUrl ? SCAN_PHOTO_ROW_HEIGHT : undefined;
    addExcelScanPhoto(workbook, eventsSheet, photoCache.get(entry.photoUrl), 9, rowNumber - 1);
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
    { width: 14 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  triggerBlobDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${payload.fileBaseName}.xlsx`
  );
}

export { downloadPersonReportPdf } from './pdfPersonReport.js';
