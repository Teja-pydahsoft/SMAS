import { formatDate, todayDateStringIst } from '@/lib/formatDate';

function cell(value) {
  if (value == null || value === '') return '';
  return value;
}

function triggerDownload(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E405F' },
  };
  row.alignment = { vertical: 'middle' };
}

function addSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  styleHeader(sheet.addRow(columns.map((col) => col.header)));
  for (const row of rows) {
    sheet.addRow(row);
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

function safeFilePart(value) {
  return String(value || 'rate_master')
    .replace(/[^\w\-]+/g, '_')
    .slice(0, 40);
}

export async function downloadRateMasterExcel({
  docNo = '',
  effectiveDate = '',
  status = '',
  rules = [],
  applicableLabourers = [],
  notApplicableLabourers = [],
  affectedLabourers = [],
} = {}) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAMS';
  workbook.created = new Date();

  const infoSheet = workbook.addWorksheet('Summary');
  infoSheet.mergeCells('A1:B1');
  infoSheet.getCell('A1').value = 'SAMS — Rate Master';
  infoSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1E405F' } };
  infoSheet.getCell('A2').value = 'Smart Access Management System';
  infoSheet.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } };
  infoSheet.columns = [{ width: 28 }, { width: 42 }];

  const infoRows = [
    ['Generated Date', todayDateStringIst()],
    ['Doc No', docNo || '—'],
    ['Effective Date', effectiveDate ? formatDate(effectiveDate) : '—'],
    ['Status', status || '—'],
    ['Rate Rules', rules.length],
    ['Applicable Labourers', applicableLabourers.length],
    ['Not Applicable Labourers', notApplicableLabourers.length],
    ['Affected Labourers', affectedLabourers.length],
  ];
  infoSheet.addRow([]);
  for (const [label, value] of infoRows) {
    const row = infoSheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }

  addSheet(
    workbook,
    'Rate Rules',
    [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Batch Name', key: 'batchName', width: 22 },
      { header: 'Labour Type', key: 'labourType', width: 18 },
      { header: 'Work Category', key: 'workCategory', width: 22 },
      { header: 'Labours', key: 'labourCount', width: 12 },
      { header: 'Working Hrs', key: 'hours', width: 14 },
      { header: 'Rate Amount', key: 'amount', width: 14 },
      { header: 'Remarks', key: 'remarks', width: 28 },
    ],
    rules.map((rule, idx) => [
      idx + 1,
      cell(rule.batchName),
      cell(rule.labourType),
      cell(rule.workCategory),
      Number(rule.labourCount || 0),
      Number(rule.hours || 0),
      Number(rule.amount || 0),
      cell(rule.remarks),
    ])
  );

  addSheet(
    workbook,
    'Applicable',
    [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Code', key: 'code', width: 16 },
      { header: 'Batch', key: 'batchName', width: 18 },
      { header: 'Labour Type', key: 'labourType', width: 18 },
      { header: 'Work Category', key: 'workCategory', width: 22 },
      { header: 'Working Hrs', key: 'hours', width: 14 },
      { header: 'Rate Amount', key: 'amount', width: 14 },
    ],
    applicableLabourers.map((labourer, idx) => [
      idx + 1,
      cell(labourer.name),
      cell(labourer.code),
      cell(labourer.batchName),
      cell(labourer.labourType),
      cell(labourer.workCategory),
      Number(labourer.currentHours || labourer.workingHours || labourer.hours || 0),
      Number(labourer.currentRate || labourer.payAmount || labourer.amount || 0),
    ])
  );

  addSheet(
    workbook,
    'Not Applicable',
    [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Code', key: 'code', width: 16 },
      { header: 'Batch', key: 'batchName', width: 18 },
      { header: 'Labour Type', key: 'labourType', width: 18 },
      { header: 'Work Category', key: 'workCategory', width: 22 },
      { header: 'Missing Fields', key: 'missing', width: 32 },
    ],
    notApplicableLabourers.map((labourer, idx) => [
      idx + 1,
      cell(labourer.name),
      cell(labourer.code),
      cell(labourer.batchName) || '—',
      cell(labourer.labourType) || '—',
      cell(labourer.workCategory) || '—',
      Array.isArray(labourer.missing) ? labourer.missing.join(', ') : cell(labourer.missing),
    ])
  );

  if (affectedLabourers.length > 0) {
    addSheet(
      workbook,
      'Affected Labourers',
      [
        { header: 'S.No', key: 'sno', width: 8 },
        { header: 'Name', key: 'name', width: 28 },
        { header: 'Code', key: 'code', width: 16 },
        { header: 'Batch', key: 'batch', width: 18 },
        { header: 'Labour Type', key: 'labourType', width: 18 },
        { header: 'Work Category', key: 'workCategory', width: 22 },
        { header: 'Working Hrs', key: 'hours', width: 14 },
        { header: 'Old Rate', key: 'oldRate', width: 12 },
        { header: 'New Rate', key: 'newRate', width: 12 },
      ],
      affectedLabourers.map((labourer, idx) => [
        idx + 1,
        cell(labourer.name),
        cell(labourer.code),
        cell(labourer.batch),
        cell(labourer.labourType),
        cell(labourer.workCategory),
        Number(labourer.newHours || labourer.oldHours || 0),
        Number(labourer.oldRate || 0),
        Number(labourer.newRate || 0),
      ])
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = todayDateStringIst();
  const fileName = docNo
    ? `SAMS_Rate_Master_${safeFilePart(docNo)}_${stamp}.xlsx`
    : `SAMS_Rate_Master_${stamp}.xlsx`;
  triggerDownload(buffer, fileName);
}
