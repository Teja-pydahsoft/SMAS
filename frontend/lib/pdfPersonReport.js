import { formatPayFrequency } from '@/lib/payFrequency';

/**
 * Individual PDF report — single A4 sheet:
 * - Top 25%: Details (full width) — photo 35% / data 65%
 * - Next 25%: Pay details (full width, below details)
 * - Bottom 50%: Attendance week tables
 */

/** Helvetica has no ₹ — use ASCII so amounts don't glyph-break / overflow cells */
function formatPdfCurrency(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  const num = n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Rs ${num}`;
}

/** Compact for narrow week Amount columns */
function formatPdfAmount(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function formatExportDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
  if (day.status === 'P') return formatPdfAmount(Number(rate) || 0);
  return formatPdfAmount(0);
}

function buildAttendanceBodyRow(date, day, rate) {
  if (!day || day.status === 'blank') {
    return [formatShortDate(date), 'Not Registered', '—'];
  }
  return [formatShortDate(date), dayStatusLabel(day), dayAmount(day, rate)];
}

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
    ['Per Day Amount', rate != null ? formatPdfCurrency(rate) : '—'],
    ['Present Days', hasRange ? String(payment?.paymentDays ?? summary?.present ?? 0) : '—'],
    ['Absent Days', hasRange ? String(summary?.absent ?? 0) : '—'],
    ['Calculated Amount', payment ? formatPdfCurrency(payment.totalAmount) : '—'],
  ];
}

function buildAttendanceWeekTables(reportData, { dateFrom = '', dateTo = '' } = {}) {
  if (!dateFrom || !dateTo) {
    return { mode: 'empty', title: 'Attendance', weeks: [] };
  }

  const days = reportData?.attendanceRange?.days || [];
  const dayByDate = Object.fromEntries(days.map((day) => [day.date, day]));
  const rate =
    reportData?.attendanceRange?.payment?.payAmount ?? reportData?.details?.payAmount ?? 0;
  const chunks = splitRangeIntoWeekChunks(dateFrom, dateTo);
  const dayCount = countRangeDays(dateFrom, dateTo);

  const weeks = chunks.map((chunk) => ({
    label: chunk.label,
    rangeLabel: chunk.rangeLabel,
    body: chunk.dates.map((date) => buildAttendanceBodyRow(date, dayByDate[date], rate)),
  }));

  const maxRows = Math.max(0, ...weeks.map((week) => week.body.length));
  for (const week of weeks) {
    while (week.body.length < maxRows) week.body.push(['', '', '']);
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

export async function downloadPersonReportPdf(reportData, options = {}) {
  const [{ jsPDF }, autoTableModule, reportMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./reportExport.js'),
  ]);
  const autoTable = autoTableModule.default;
  const { buildPersonReportExport, loadPhotoForExport } = reportMod;
  const payload = buildPersonReportExport(reportData, options);
  const photo = await loadPhotoForExport(payload.holderPhotoUrl);
  const detailRows = buildPersonDetailRows(reportData, options);
  const payRows = buildPayDetailRows(reportData, options);
  const attendance = buildAttendanceWeekTables(reportData, options);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 24;
  const gap = 8;
  const contentWidth = pageWidth - margin * 2;
  const footerReserve = 22;
  const headerH = 48;
  const BRAND = [30, 64, 175];

  function styleAttendanceCell(data) {
    if (data.section !== 'body') return;
    const row = data.row.raw || [];
    if (!row[0] && !row[1] && !row[2]) {
      data.cell.styles.fillColor = [255, 255, 255];
      data.cell.styles.textColor = [255, 255, 255];
      data.cell.styles.lineWidth = 0;
      return;
    }
    const status = String(row[1] || '');
    if (status === 'Not Registered' || status === 'Not Reg.') {
      data.cell.styles.textColor = [100, 116, 139];
      data.cell.styles.fillColor = [241, 245, 249];
      data.cell.styles.fontStyle = 'italic';
      return;
    }
    if (data.column.index === 1 && status === 'Present') {
      data.cell.styles.textColor = [22, 163, 74];
      data.cell.styles.fontStyle = 'bold';
    } else if (data.column.index === 1 && status === 'Absent') {
      data.cell.styles.textColor = [220, 38, 38];
      data.cell.styles.fontStyle = 'bold';
    }
  }

  function compactWeekBody(body) {
    return body.map((row) => {
      if (!row[0] && !row[1]) return row;
      if (row[1] === 'Not Registered') return [row[0], 'Not Reg.', row[2]];
      return row;
    });
  }

  // Stacked bands: Details 25% → Pay 25% → Attendance 50%
  const usableTop = headerH + 6;
  const usableBottom = pageHeight - footerReserve;
  const usableH = usableBottom - usableTop;
  const detailsBandH = usableH * 0.25;
  const payBandH = usableH * 0.25;
  const attendBandH = usableH * 0.5;
  const detailsBandY = usableTop;
  const payBandY = usableTop + detailsBandH;
  const attendBandY = usableTop + detailsBandH + payBandH;

  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SAMS — Individual Access Report', margin, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generated: ${formatExportDateTime(new Date())}`, margin, 34);
  doc.setTextColor(0, 0, 0);

  const sectionTitleH = 18;
  const topFont = 9.5;
  const labelW = 120;

  // DETAILS — full width, top 25%; photo 35% width / data 65% width, same height
  let y = detailsBandY;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND);
  doc.text('DETAILS', margin, y + 12);
  doc.setTextColor(0, 0, 0);
  y += sectionTitleH;

  const detailsBodyH = Math.max(60, detailsBandY + detailsBandH - y - 4);
  const photoGap = 8;
  const photoW = contentWidth * 0.35;
  const photoH = detailsBodyH;
  const detailsTableLeft = margin + photoW + photoGap;
  const detailsTableWidth = contentWidth - photoW - photoGap;

  if (photo?.dataUrl) {
    try {
      const imageData = photo.dataUrl.includes(',') ? photo.dataUrl.split(',')[1] : photo.dataUrl;
      // Fill the 35% × full details-band box (cover-style via stretch)
      doc.addImage(imageData, 'JPEG', margin, y, photoW, photoH);
    } catch {
      /* ignore bad photo */
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, photoW, photoH);
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, photoW, photoH, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('No photo', margin + photoW / 2, y + photoH / 2, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  // Match table height to photo / details band
  const detailRowH = Math.max(
    14,
    Math.floor(detailsBodyH / Math.max(detailRows.length, 1))
  );
  const detailPad = Math.max(2, Math.floor((detailRowH - topFont) / 2));

  autoTable(doc, {
    startY: y,
    head: false,
    body: detailRows,
    theme: 'plain',
    pageBreak: 'auto',
    styles: {
      fontSize: topFont,
      minCellHeight: detailRowH,
      cellPadding: { top: detailPad, bottom: detailPad, left: 6, right: 6 },
      lineColor: [226, 232, 240],
      lineWidth: 0.3,
      overflow: 'ellipsize',
      valign: 'middle',
    },
    columnStyles: {
      0: {
        cellWidth: labelW,
        fontStyle: 'bold',
        textColor: [71, 85, 105],
        fillColor: [248, 250, 252],
      },
      1: { cellWidth: detailsTableWidth - labelW, textColor: [15, 23, 42] },
    },
    margin: {
      left: detailsTableLeft,
      right: pageWidth - (detailsTableLeft + detailsTableWidth),
      bottom: footerReserve,
    },
    tableWidth: detailsTableWidth,
  });

  // PAY DETAILS — full width, below details (next 25%)
  doc.setPage(1);
  y = payBandY;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND);
  doc.text('PAY DETAILS', margin, y + 10);
  doc.setTextColor(0, 0, 0);
  y += sectionTitleH;

  const payBodyH = payBandY + payBandH - y - 4;
  const payRowH = Math.max(14, Math.min(28, Math.floor(payBodyH / Math.max(payRows.length, 1))));
  const payPad = Math.max(2, Math.floor((payRowH - topFont) / 2));
  const payLabelW = 140;

  autoTable(doc, {
    startY: y,
    head: false,
    body: payRows,
    theme: 'plain',
    pageBreak: 'auto',
    styles: {
      fontSize: topFont,
      minCellHeight: payRowH,
      cellPadding: { top: payPad, bottom: payPad, left: 6, right: 6 },
      lineColor: [226, 232, 240],
      lineWidth: 0.3,
      overflow: 'ellipsize',
      valign: 'middle',
    },
    columnStyles: {
      0: {
        cellWidth: payLabelW,
        fontStyle: 'bold',
        textColor: [15, 118, 110],
        fillColor: [240, 253, 250],
      },
      1: {
        cellWidth: contentWidth - payLabelW,
        textColor: [15, 23, 42],
        halign: 'left',
      },
    },
    margin: { left: margin, right: margin, bottom: footerReserve },
    tableWidth: contentWidth,
  });

  // ATTENDANCE — bottom 50%
  doc.setPage(1);
  let ay = attendBandY;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.6);
  doc.line(margin, ay, pageWidth - margin, ay);
  ay += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  doc.text(attendance.title.toUpperCase(), margin, ay);
  doc.setTextColor(0, 0, 0);
  ay += 12;

  const attendTableH = Math.max(40, attendBandY + attendBandH - ay - 2);
  const attendBottomMargin = Math.max(
    footerReserve,
    pageHeight - (attendBandY + attendBandH)
  );
  // Size rows so every selected from→to date fits (don't clip the last day)
  const fitRows = (rowCount, headH) => {
    const n = Math.max(rowCount, 1);
    return Math.max(10, Math.floor((attendTableH - headH - 12) / n));
  };

  if (!attendance.weeks.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Select a date range to view attendance and pay amounts.', margin, ay + 12);
  } else if (attendance.mode === 'single') {
    const week = attendance.weeks[0];
    const bodyRows = compactWeekBody(
      week.body.filter((row) => Boolean(row[0] || row[1] || row[2]))
    );
    const headH = 16 + 14;
    const rowH = fitRows(bodyRows.length, headH);
    const fontSize = rowH >= 20 ? 9 : 8;
    const headFontSize = Math.max(fontSize, 9);
    const padV = Math.max(1, Math.min(5, Math.floor((rowH - fontSize) / 2)));

    autoTable(doc, {
      startY: ay,
      pageBreak: 'auto',
      head: [
        [
          {
            content: `${week.label}  ·  ${week.rangeLabel}`,
            colSpan: 3,
            styles: {
              fillColor: BRAND,
              textColor: 255,
              halign: 'left',
              fontStyle: 'bold',
              minCellHeight: 16,
              fontSize: 10,
            },
          },
        ],
        [
          {
            content: 'Date',
            styles: {
              fillColor: [37, 99, 235],
              textColor: 255,
              fontSize: headFontSize,
              fontStyle: 'bold',
              minCellHeight: 14,
            },
          },
          {
            content: 'Status',
            styles: {
              fillColor: [37, 99, 235],
              textColor: 255,
              fontSize: headFontSize,
              fontStyle: 'bold',
              minCellHeight: 14,
            },
          },
          {
            content: 'Amount (Rs)',
            styles: {
              fillColor: [37, 99, 235],
              textColor: 255,
              fontSize: headFontSize,
              fontStyle: 'bold',
              minCellHeight: 14,
            },
          },
        ],
      ],
      body: bodyRows,
      styles: {
        fontSize,
        minCellHeight: rowH,
        cellPadding: { top: padV, bottom: padV, left: 4, right: 4 },
        overflow: 'ellipsize',
        lineColor: [226, 232, 240],
        lineWidth: 0.3,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.28 },
        1: { cellWidth: contentWidth * 0.4 },
        2: {
          cellWidth: contentWidth * 0.32,
          halign: 'right',
          cellPadding: { top: padV, bottom: padV, left: 4, right: 6 },
        },
      },
      didParseCell: styleAttendanceCell,
      margin: { left: margin, right: margin, bottom: attendBottomMargin },
      tableWidth: contentWidth,
    });
  } else {
    const perRow = Math.min(4, attendance.weeks.length);
    const tableWidth = (contentWidth - gap * (perRow - 1)) / perRow;
    const bodyRowCount = Math.max(...attendance.weeks.map((w) => w.body.length), 1);
    const headH = 14 + 11 + 11;
    const rowH = fitRows(bodyRowCount, headH);
    const fontSize = rowH >= 20 ? 8 : rowH >= 13 ? 7 : 6.5;
    const headColFont = Math.max(fontSize, 7.5);
    const padV = Math.max(0.5, Math.min(3, Math.floor((rowH - fontSize) / 2)));

    const weekStartY = ay;
    attendance.weeks.slice(0, perRow).forEach((week, index) => {
      const left = margin + index * (tableWidth + gap);
      const body = compactWeekBody(week.body);
      const colDate = tableWidth * 0.28;
      const colStatus = tableWidth * 0.38;
      const colAmount = tableWidth - colDate - colStatus;

      doc.setPage(1);
      autoTable(doc, {
        startY: weekStartY,
        pageBreak: 'auto',
        rowPageBreak: 'auto',
        head: [
          [
            {
              content: week.label,
              colSpan: 3,
              styles: {
                fillColor: BRAND,
                textColor: 255,
                halign: 'center',
                fontStyle: 'bold',
                fontSize: 9,
                cellPadding: 2.5,
                minCellHeight: 14,
              },
            },
          ],
          [
            {
              content: week.rangeLabel,
              colSpan: 3,
              styles: {
                fillColor: [239, 246, 255],
                textColor: [30, 64, 175],
                halign: 'center',
                fontStyle: 'bold',
                fontSize: 7,
                cellPadding: 2,
                minCellHeight: 11,
              },
            },
          ],
          [
            {
              content: 'Date',
              styles: {
                fillColor: [37, 99, 235],
                textColor: 255,
                fontSize: headColFont,
                fontStyle: 'bold',
                minCellHeight: 11,
              },
            },
            {
              content: 'Status',
              styles: {
                fillColor: [37, 99, 235],
                textColor: 255,
                fontSize: headColFont,
                fontStyle: 'bold',
                minCellHeight: 11,
              },
            },
            {
              content: 'Amt',
              styles: {
                fillColor: [37, 99, 235],
                textColor: 255,
                fontSize: headColFont,
                fontStyle: 'bold',
                minCellHeight: 11,
              },
            },
          ],
        ],
        body,
        styles: {
          fontSize,
          minCellHeight: rowH,
          cellPadding: { top: padV, bottom: padV, left: 2, right: 2 },
          overflow: 'ellipsize',
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: colDate, halign: 'left' },
          1: { cellWidth: colStatus, halign: 'left' },
          2: {
            cellWidth: colAmount,
            halign: 'right',
            cellPadding: { top: padV, bottom: padV, left: 2, right: 5 },
          },
        },
        didParseCell: styleAttendanceCell,
        margin: {
          left,
          right: pageWidth - (left + tableWidth),
          bottom: attendBottomMargin,
        },
        tableWidth,
      });
    });
  }

  // Do NOT delete overflow pages — that was dropping the last selected date (e.g. Jul 16)
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${payload.details?.holderName || 'Report'} · ${payload.details?.registrationCode || ''}`.trim(),
      margin,
      pageHeight - 10
    );
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 10, {
      align: 'right',
    });
  }

  doc.save(`${payload.fileBaseName}.pdf`);
}
