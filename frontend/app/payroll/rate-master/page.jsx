'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/AuthProvider';
import PageShell from '@/components/PageShell';
import { formatDate } from '@/lib/formatDate';
import { downloadRateMasterExcel } from '@/lib/rateMasterExport';

function parseCombinationsPayload(data) {
  if (Array.isArray(data)) {
    return { combinations: data, applicableLabourers: [], notApplicableLabourers: [] };
  }
  return {
    combinations: Array.isArray(data?.combinations) ? data.combinations : [],
    applicableLabourers: Array.isArray(data?.applicableLabourers) ? data.applicableLabourers : [],
    notApplicableLabourers: Array.isArray(data?.notApplicableLabourers) ? data.notApplicableLabourers : [],
  };
}

function labourerMatchesQuery(labourer, searchQuery) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return (
    (labourer.name || '').toLowerCase().includes(q) ||
    (labourer.code || '').toLowerCase().includes(q) ||
    (labourer.batchName || '').toLowerCase().includes(q) ||
    (labourer.labourType || '').toLowerCase().includes(q) ||
    (labourer.workCategory || '').toLowerCase().includes(q) ||
    (labourer.missing || []).join(' ').toLowerCase().includes(q)
  );
}

function mapCombinationRules(combinations) {
  return combinations.map((c) => ({
    batchName: c.batchName,
    labourType: c.labourType,
    workCategory: c.workCategory,
    amount: c.currentRate || 0,
    hours: c.currentHours || 8,
    remarks: '',
    configured: false,
    labourCount: c.labourCount || 0,
  }));
}

export default function RateMasterPage() {
  const { can } = useAuth();
  const canRead = can('payroll_rate_master', 'read');
  const canWrite = can('payroll_rate_master', 'write');

  const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
  const [editId, setEditId] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create Form State
  const [docNo, setDocNo] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [rules, setRules] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'configured' | 'pending'
  
  // Table Filters State
  const [filterBatch, setFilterBatch] = useState('');
  const [filterLabourType, setFilterLabourType] = useState('');
  const [filterWorkCategory, setFilterWorkCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Preview Dialog State
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // View Dialog State
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewActiveTab, setViewActiveTab] = useState('rates');
  const [notApplicableLabourers, setNotApplicableLabourers] = useState([]);
  const [applicableLabourers, setApplicableLabourers] = useState([]);
  const [labourerListMode, setLabourerListMode] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.payroll.listRateMasters();
      setHistory(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCombinations = useCallback(async () => {
    try {
      const data = await api.payroll.getCombinations();
      const { combinations, applicableLabourers: readyLabourers, notApplicableLabourers: missingLabourers } = parseCombinationsPayload(data);
      setApplicableLabourers(readyLabourers);
      setNotApplicableLabourers(missingLabourers);
      return { combinations, applicableLabourers: readyLabourers, notApplicableLabourers: missingLabourers };
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to fetch combinations');
      return { combinations: [], applicableLabourers: [], notApplicableLabourers: [] };
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    fetchHistory();
    fetchCombinations();
  }, [canRead, fetchHistory, fetchCombinations]);

  useEffect(() => {
    if (mode === 'create') {
      fetchCombinations().then((result) => {
        setRules(mapCombinationRules(result?.combinations || []));
      });
    } else if (mode === 'list') {
      setRules([]);
      setActiveFilter('all');
    }
  }, [mode, fetchCombinations]);

  const handleRuleChange = (index, field, value) => {
    const newRules = [...rules];
    newRules[index][field] = value;
    if (field === 'amount') {
      newRules[index].configured = true;
    }
    setRules(newRules);
  };

  const handlePreview = async (e) => {
    e.preventDefault();
    if (!docNo || !effectiveDate) {
      setError('Doc No and Effective Date are required.');
      return;
    }
    const configuredRules = rules.filter(r => r.configured && r.amount > 0 && r.hours > 0);
    if (configuredRules.length === 0) {
      setError('Please configure at least one rule with an amount and hours greater than 0.');
      return;
    }
    
    setError('');
    setPreviewLoading(true);
    try {
      let draft;
      if (mode === 'edit' && editId) {
        draft = await api.payroll.update(editId, { docNo, effectiveDate, rules: configuredRules });
      } else {
        draft = await api.payroll.create({ docNo, effectiveDate, rules: configuredRules });
      }
      const previewRes = await api.payroll.preview({ docNo, effectiveDate, rules: configuredRules });
      setPreviewData({ ...previewRes, rateMasterId: draft._id });
      setShowPreview(true);
    } catch (err) {
      setError(err.message || 'Failed to generate preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveDraft = async (e) => {
    e.preventDefault();
    if (!docNo || !effectiveDate) {
      setError('Doc No and Effective Date are required.');
      return;
    }
    const configuredRules = rules.filter(r => r.configured && r.amount > 0 && r.hours > 0);
    if (configuredRules.length === 0) {
      setError('Please configure at least one rule with an amount and hours greater than 0.');
      return;
    }
    
    setError('');
    setPreviewLoading(true);
    try {
      if (mode === 'edit' && editId) {
        await api.payroll.update(editId, { docNo, effectiveDate, rules: configuredRules });
      } else {
        await api.payroll.create({ docNo, effectiveDate, rules: configuredRules });
      }
      setMode('list');
      setDocNo('');
      setEffectiveDate('');
      setRules([]);
      fetchHistory();
    } catch (err) {
      setError(err.message || 'Failed to save draft');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    if (!previewData?.rateMasterId) return;
    setApplying(true);
    try {
      await api.payroll.apply(previewData.rateMasterId);
      setShowPreview(false);
      setMode('list');
      setDocNo('');
      setEffectiveDate('');
      setRules([]);
      setPreviewData(null);
      fetchHistory();
    } catch (err) {
      setError(err.message || 'Failed to apply rate master');
      setShowPreview(false);
    } finally {
      setApplying(false);
    }
  };

  const handleApplyDraft = async (id) => {
    if (!confirm('Are you sure you want to apply this rate master? This action will update payroll amounts.')) return;
    setLoading(true);
    try {
      await api.payroll.apply(id);
      fetchHistory();
    } catch (err) {
      setError(err.message || 'Failed to apply rate master');
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (id) => {
    setViewLoading(true);
    try {
      const data = await api.payroll.getRateMasterView(id);
      setViewData(data);
      setViewActiveTab('rates');
      setShowViewDialog(true);
    } catch (err) {
      setError(err.message || 'Failed to fetch rate master details');
    } finally {
      setViewLoading(false);
    }
  };

  const handleEdit = async (id) => {
    setLoading(true);
    try {
      const rmData = await api.payroll.getRateMasterView(id);
      const payload = await api.payroll.getCombinations();
      const { combinations, applicableLabourers: readyLabourers, notApplicableLabourers: missingLabourers } = parseCombinationsPayload(payload);
      setApplicableLabourers(readyLabourers);
      setNotApplicableLabourers(missingLabourers);

      const existingRulesMap = new Map();
      rmData.rateMaster.rules.forEach(r => {
        existingRulesMap.set(`${r.batchName}|${r.labourType}|${r.workCategory}`, r);
      });

      const mergedRules = combinations.map(c => {
        const key = `${c.batchName}|${c.labourType}|${c.workCategory}`;
        if (existingRulesMap.has(key)) {
          const r = existingRulesMap.get(key);
          return { ...r, configured: true, isNew: false, labourCount: c.labourCount || 0 };
        } else {
          return {
            batchName: c.batchName,
            labourType: c.labourType,
            workCategory: c.workCategory,
            amount: c.currentRate || 0,
            hours: c.currentHours || 8,
            remarks: '',
            configured: false,
            isNew: true,
            labourCount: c.labourCount || 0
          };
        }
      });
      
      // Also add any old rules that might no longer exist in combinations
      rmData.rateMaster.rules.forEach(r => {
        const key = `${r.batchName}|${r.labourType}|${r.workCategory}`;
        if (!mergedRules.some(mr => `${mr.batchName}|${mr.labourType}|${mr.workCategory}` === key)) {
          mergedRules.push({ ...r, configured: true, isNew: false, labourCount: 0 });
        }
      });

      setDocNo(rmData.rateMaster.docNo);
      setEffectiveDate(rmData.rateMaster.effectiveDate ? rmData.rateMaster.effectiveDate.split('T')[0] : '');
      setRules(mergedRules);
      setEditId(id);
      setMode('edit');
    } catch (err) {
      setError(err.message || 'Failed to initialize edit mode');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = async (payload) => {
    setExportingExcel(true);
    try {
      await downloadRateMasterExcel(payload);
    } catch (err) {
      setError(err.message || 'Failed to download Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleDownloadLiveRates = async () => {
    setExportingExcel(true);
    try {
      const payload = await api.payroll.getCombinations();
      const { combinations, applicableLabourers: readyLabourers, notApplicableLabourers: missingLabourers } = parseCombinationsPayload(payload);
      setApplicableLabourers(readyLabourers);
      setNotApplicableLabourers(missingLabourers);
      await downloadRateMasterExcel({
        docNo: 'Current Rates',
        status: 'Live',
        rules: combinations.map((c) => ({
          batchName: c.batchName,
          labourType: c.labourType,
          workCategory: c.workCategory,
          labourCount: c.labourCount || 0,
          hours: c.currentHours || 0,
          amount: c.currentRate || 0,
          remarks: '',
        })),
        applicableLabourers: readyLabourers,
        notApplicableLabourers: missingLabourers,
      });
    } catch (err) {
      setError(err.message || 'Failed to download Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleDownloadHistoryItem = async (rm) => {
    await handleDownloadExcel({
      docNo: rm.docNo,
      effectiveDate: rm.effectiveDate,
      status: rm.status,
      rules: rm.rules || [],
      applicableLabourers,
      notApplicableLabourers,
    });
  };

  const handleDownloadCurrentForm = async () => {
    await handleDownloadExcel({
      docNo: docNo || 'Draft',
      effectiveDate,
      status: mode === 'edit' ? 'Draft' : 'New',
      rules,
      applicableLabourers,
      notApplicableLabourers,
    });
  };

  const handleDownloadView = async () => {
    if (!viewData?.rateMaster) return;
    await handleDownloadExcel({
      docNo: viewData.rateMaster.docNo,
      effectiveDate: viewData.rateMaster.effectiveDate,
      status: viewData.rateMaster.status,
      rules: viewData.rateMaster.rules || [],
      affectedLabourers: viewData.affectedLabourers || [],
      applicableLabourers,
      notApplicableLabourers,
    });
  };

  const filteredApplicable = applicableLabourers.filter((labourer) => labourerMatchesQuery(labourer, searchQuery));
  const filteredNotApplicable = notApplicableLabourers.filter((labourer) => labourerMatchesQuery(labourer, searchQuery));

  if (!canRead) {
    return (
      <PageShell title="Rate Master Setup" description="Manage payroll rate rules">
        <p className="read-only-banner">You do not have access to Rate Master Setup.</p>
      </PageShell>
    );
  }

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .responsive-rate-table {
            min-width: 100% !important;
          }
          .responsive-rate-table thead {
            display: none;
          }
          .responsive-rate-table, .responsive-rate-table tbody, .responsive-rate-table tr, .responsive-rate-table td {
            display: block;
            width: 100%;
          }
          .responsive-rate-table tr {
            margin-bottom: 1rem;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 1rem;
            background: var(--surface-base, #fff);
          }
          .responsive-rate-table td {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border: none;
            border-bottom: 1px solid var(--border-color);
            text-align: right;
          }
          .responsive-rate-table td:last-child {
            border-bottom: none;
          }
          .responsive-rate-table td::before {
            content: attr(data-label);
            font-weight: 600;
            color: var(--text-muted);
            text-align: left;
            margin-right: 1rem;
          }
          .stats-container {
            flex-wrap: nowrap !important;
            gap: 0.5rem !important;
            justify-content: space-between !important;
            padding: 0.75rem 0.5rem !important;
          }
          .stats-container > div {
            flex: 1;
            text-align: center;
            font-size: 0.9rem;
          }
          .stats-container strong {
            display: block;
            font-size: 0.7rem;
            margin-bottom: 0.2rem;
            color: var(--text-muted);
          }
        }
        .rm-view-modal {
          width: 100%;
          max-width: 1100px;
          max-height: calc(100vh - 32px);
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: hidden;
          background: var(--surface-base, #fff);
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .rm-view-header {
          flex-shrink: 0;
          padding: 1.5rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .rm-view-body {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .rm-view-footer {
          flex-shrink: 0;
          padding: 1rem 1.5rem;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: flex-end;
          background: var(--surface-base, #fff);
        }
        .rate-master-view-table-wrapper {
          flex: 1;
          min-height: 0;
          overflow-x: auto;
          overflow-y: auto;
          border: 1px solid var(--border-color);
          border-radius: 4px;
        }
        .rate-master-view-table-wrapper thead {
          position: sticky;
          top: 0;
          z-index: 2;
          background-color: var(--bg-secondary);
        }
      `}</style>
      <PageShell 
        title="Rate Master Setup" 
        description="Manage and apply pay rates across categories"
      >
        <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 200px)', minHeight: 0 }}>
        <div className="card-header" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 className="section-title">
            {mode === 'list' ? 'Rate Master History' : mode === 'edit' ? 'Edit Rate Master' : 'New Rate Master'}
          </h3>
          {mode === 'list' && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                className="btn-secondary"
                onClick={handleDownloadLiveRates}
                disabled={exportingExcel}
              >
                {exportingExcel ? 'Downloading…' : 'Download Excel'}
              </button>
              {canWrite && (
                <button className="btn-primary" onClick={() => setMode('create')}>
                  + New Rate Master
                </button>
              )}
            </div>
          )}
          {(mode === 'create' || mode === 'edit') && (
            <button className="btn-secondary" onClick={() => setMode('list')}>
              Cancel
            </button>
          )}
        </div>

        {error && <div className="error-msg" style={{ marginBottom: '1rem' }}>{error}</div>}

        {mode === 'list' ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
              <div
                style={{
                  padding: '0.9rem 1rem',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #6ee7b7',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <strong>Applicable Labourers</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Have Batch, Labour Type, and Work Category — these labourers can receive a rate.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="badge badge--success">{applicableLabourers.length}</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setLabourerListMode('applicable')}
                    disabled={applicableLabourers.length === 0}
                  >
                    View List
                  </button>
                </div>
              </div>
              <div
                style={{
                  padding: '0.9rem 1rem',
                  backgroundColor: notApplicableLabourers.length ? '#fff7ed' : 'var(--bg-secondary)',
                  border: notApplicableLabourers.length ? '1px solid #fdba74' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <strong>Not Applicable Labourers</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Missing Batch, Labour Type, or Work Category — these labourers cannot receive a rate.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="badge badge--warning">{notApplicableLabourers.length}</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setLabourerListMode('notApplicable')}
                    disabled={notApplicableLabourers.length === 0}
                  >
                    View List
                  </button>
                </div>
              </div>
            </div>
          <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading ? (
              <p>Loading history...</p>
            ) : history.length === 0 ? (
              <p className="hint-text">No Rate Masters found.</p>
            ) : (
              <table className="rc-table">
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--surface-base)', boxShadow: '0 1px 0 var(--border-color)' }}>
                  <tr>
                    <th>Doc No</th>
                    <th>Effective Date</th>
                    <th>Status</th>
                    <th>Rules</th>
                    <th>Applied By</th>
                    <th>Applied At</th>
                    <th style={{ width: '140px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(rm => (
                    <tr key={rm._id}>
                      <td><strong>{rm.docNo}</strong></td>
                      <td>{formatDate(rm.effectiveDate)}</td>
                      <td>
                        <span className={`badge ${rm.status === 'Applied' ? 'badge--success' : 'badge--warning'}`}>
                          {rm.status}
                        </span>
                      </td>
                      <td>{rm.rules?.length || 0}</td>
                      <td>{rm.appliedBy || '-'}</td>
                      <td>{rm.appliedAt ? formatDate(rm.appliedAt) : '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                          <button 
                            className="btn-icon" 
                            onClick={() => handleView(rm._id)}
                            title="View"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-color)' }}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => handleDownloadHistoryItem(rm)}
                            title="Download Excel"
                            disabled={exportingExcel}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </button>
                          {canWrite && (
                            <button
                              className="btn-icon"
                              onClick={() => handleEdit(rm._id)}
                              title="Edit"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                          )}
                          {canWrite && rm.status === 'Draft' && (
                            <button
                              className="btn-icon"
                              onClick={() => handleApplyDraft(rm._id)}
                              title="Apply"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success-color)' }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 13l4 4L19 7"></path>
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </div>
        ) : (
          <form onSubmit={handlePreview} className="form-layout" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="form-row" style={{ flexShrink: 0, display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Doc No</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required 
                  value={docNo}
                  onChange={e => setDocNo(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Effective Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  required
                  value={effectiveDate}
                  onChange={e => setEffectiveDate(e.target.value)}
                />
              </div>
            </div>

            <div className="stats-container" style={{ flexShrink: 0, marginBottom: '1rem', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div 
                style={{ cursor: 'pointer', opacity: activeFilter === 'all' ? 1 : 0.6, borderBottom: activeFilter === 'all' ? '2px solid var(--primary-color)' : '2px solid transparent', paddingBottom: '0.25rem' }}
                onClick={() => setActiveFilter('all')}
              >
                <strong>Total Combinations</strong> {rules.length}
              </div>
              <div 
                style={{ cursor: 'pointer', opacity: activeFilter === 'configured' ? 1 : 0.6, borderBottom: activeFilter === 'configured' ? '2px solid var(--success-color)' : '2px solid transparent', paddingBottom: '0.25rem' }}
                onClick={() => setActiveFilter('configured')}
              >
                <strong>Configured Rates</strong> {rules.filter(r => r.configured && r.amount > 0).length}
              </div>
              <div 
                style={{ cursor: 'pointer', opacity: activeFilter === 'pending' ? 1 : 0.6, borderBottom: activeFilter === 'pending' ? '2px solid var(--danger-color)' : '2px solid transparent', paddingBottom: '0.25rem' }}
                onClick={() => setActiveFilter('pending')}
              >
                <strong>Pending Rates</strong> {rules.filter(r => !r.configured || r.amount <= 0).length}
              </div>
              <div
                style={{ cursor: 'pointer', opacity: activeFilter === 'applicable' ? 1 : 0.6, borderBottom: activeFilter === 'applicable' ? '2px solid var(--success-color)' : '2px solid transparent', paddingBottom: '0.25rem' }}
                onClick={() => setActiveFilter('applicable')}
              >
                <strong>Applicable</strong> {applicableLabourers.length}
              </div>
              <div
                style={{ cursor: 'pointer', opacity: activeFilter === 'notApplicable' ? 1 : 0.6, borderBottom: activeFilter === 'notApplicable' ? '2px solid #d97706' : '2px solid transparent', paddingBottom: '0.25rem' }}
                onClick={() => setActiveFilter('notApplicable')}
              >
                <strong>Not Applicable</strong> {notApplicableLabourers.length}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder={
                  activeFilter === 'notApplicable'
                    ? 'Search not applicable labourers...'
                    : activeFilter === 'applicable'
                      ? 'Search applicable labourers...'
                      : 'Search rules...'
                }
                className="form-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ flex: 1, minWidth: '200px' }}
              />
              {activeFilter !== 'notApplicable' && activeFilter !== 'applicable' && (
                <>
                  <select className="form-input" value={filterBatch} onChange={e => setFilterBatch(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
                    <option value="">All Batches</option>
                    {[...new Set(rules.map(r => r.batchName))].sort().map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <select className="form-input" value={filterLabourType} onChange={e => setFilterLabourType(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
                    <option value="">All Labour Types</option>
                    {[...new Set(rules.map(r => r.labourType))].sort().map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <select className="form-input" value={filterWorkCategory} onChange={e => setFilterWorkCategory(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
                    <option value="">All Work Categories</option>
                    {[...new Set(rules.map(r => r.workCategory))].sort().map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {activeFilter === 'notApplicable' ? (
              <div className="table-responsive" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>
                {filteredNotApplicable.length === 0 ? (
                  <p className="hint-text">No labourers are missing Batch, Labour Type, or Work Category.</p>
                ) : (
                  <table className="rc-table responsive-rate-table" style={{ minWidth: '800px' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--surface-base)', boxShadow: '0 1px 0 var(--border-color)' }}>
                      <tr>
                        <th style={{ width: '60px' }}>S.No</th>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Batch</th>
                        <th>Labour Type</th>
                        <th>Work Category</th>
                        <th>Missing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNotApplicable.map((labourer, idx) => (
                        <tr key={labourer.id || labourer.code || idx}>
                          <td data-label="S.No">{idx + 1}</td>
                          <td data-label="Name"><strong>{labourer.name}</strong></td>
                          <td data-label="Code">{labourer.code}</td>
                          <td data-label="Batch">{labourer.batchName || '—'}</td>
                          <td data-label="Labour Type">{labourer.labourType || '—'}</td>
                          <td data-label="Work Category">{labourer.workCategory || '—'}</td>
                          <td data-label="Missing">
                            {(labourer.missing || []).map((field) => (
                              <span key={field} className="badge badge--warning" style={{ marginRight: '0.35rem' }}>{field}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : activeFilter === 'applicable' ? (
              <div className="table-responsive" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>
                {filteredApplicable.length === 0 ? (
                  <p className="hint-text">No labourers currently have Batch, Labour Type, and Work Category.</p>
                ) : (
                  <table className="rc-table responsive-rate-table" style={{ minWidth: '800px' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--surface-base)', boxShadow: '0 1px 0 var(--border-color)' }}>
                      <tr>
                        <th style={{ width: '60px' }}>S.No</th>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Batch</th>
                        <th>Labour Type</th>
                        <th>Work Category</th>
                        <th>Working Hrs</th>
                        <th>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApplicable.map((labourer, idx) => (
                        <tr key={labourer.id || labourer.code || idx}>
                          <td data-label="S.No">{idx + 1}</td>
                          <td data-label="Name"><strong>{labourer.name}</strong></td>
                          <td data-label="Code">{labourer.code}</td>
                          <td data-label="Batch">{labourer.batchName || '—'}</td>
                          <td data-label="Labour Type">{labourer.labourType || '—'}</td>
                          <td data-label="Work Category">{labourer.workCategory || '—'}</td>
                          <td data-label="Working Hrs">{labourer.currentHours || labourer.workingHours || '—'}</td>
                          <td data-label="Rate">&#x20B9;{labourer.currentRate || labourer.payAmount || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
            <div className="table-responsive" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 }}>
              <table className="rc-table responsive-rate-table" style={{ minWidth: '800px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--surface-base)', boxShadow: '0 1px 0 var(--border-color)' }}>
                  <tr>
                    <th style={{ width: '60px' }}>S.No</th>
                    <th>Batch Name</th>
                    <th>Labour Type</th>
                    <th>Work Category</th>
                    <th style={{ width: '90px' }}>Labours</th>
                    <th style={{ width: '120px' }}>Working Hrs</th>
                    <th style={{ width: '120px' }}>New Rate</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {rules
                    .map((r, i) => ({ ...r, originalIndex: i }))
                    .filter(r => {
                      if (activeFilter === 'configured') return r.configured && r.amount > 0;
                      if (activeFilter === 'pending') return !r.configured || r.amount <= 0;
                      return true;
                    })
                    .filter(r => {
                      if (filterBatch && r.batchName !== filterBatch) return false;
                      if (filterLabourType && r.labourType !== filterLabourType) return false;
                      if (filterWorkCategory && r.workCategory !== filterWorkCategory) return false;
                      if (searchQuery) {
                        const q = searchQuery.toLowerCase();
                        return (
                          (r.batchName || '').toLowerCase().includes(q) ||
                          (r.labourType || '').toLowerCase().includes(q) ||
                          (r.workCategory || '').toLowerCase().includes(q) ||
                          (r.remarks || '').toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map((rule, displayIdx) => (
                    <tr key={rule.originalIndex}>
                      <td data-label="S.No">{displayIdx + 1}</td>
                      <td data-label="Batch Name">{rule.batchName}</td>
                      <td data-label="Labour Type">{rule.labourType}</td>
                      <td data-label="Work Category">{rule.workCategory}</td>
                      <td data-label="Labours">
                        <span className="badge badge--secondary">{rule.labourCount || 0}</span>
                      </td>
                      <td data-label="Working Hrs">
                        <input type="number" min="0" step="0.5" className="form-input" value={rule.hours} onChange={e => handleRuleChange(rule.originalIndex, 'hours', e.target.value)} required />
                      </td>
                      <td data-label="New Rate">
                        <input type="number" min="0" className="form-input" value={rule.amount} onChange={e => handleRuleChange(rule.originalIndex, 'amount', e.target.value)} required />
                      </td>
                      <td data-label="Remarks">
                        <input type="text" className="form-input" value={rule.remarks} onChange={e => handleRuleChange(rule.originalIndex, 'remarks', e.target.value)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}

            <div style={{ flexShrink: 0, marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button type="button" className="btn-secondary" onClick={handleDownloadCurrentForm} disabled={exportingExcel}>
                {exportingExcel ? 'Downloading…' : 'Download Excel'}
              </button>
              <button type="button" className="btn-secondary" onClick={handleSaveDraft} disabled={previewLoading}>
                {previewLoading ? 'Saving...' : 'Save as Draft'}
              </button>
              <button type="button" className="btn-primary" onClick={handlePreview} disabled={previewLoading}>
                {previewLoading ? 'Loading Preview...' : 'Preview Before Apply'}
              </button>
            </div>
          </form>
        )}
      </div>
      </PageShell>

      {showPreview && previewData && (
        <div className="dialog-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="dialog-content card" style={{ width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '0' }}>
            <div className="dialog-header" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0 }}>Confirm Rate Master Changes</h3>
            </div>
            
            <div className="dialog-body" style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
                <div><strong>Doc No:</strong> {docNo}</div>
                <div><strong>Effective Date:</strong> {formatDate(effectiveDate)}</div>
                <div><strong>Rules:</strong> {rules.filter(r => r.configured && r.amount > 0).length}</div>
                <div><strong>Affected Labourers:</strong> {previewData.affectedCount}</div>
              </div>

              {rules.filter(r => r.configured && r.amount > 0).length === 0 ? (
                <p>No rates have been configured.</p>
              ) : (
                <div className="table-responsive" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
                  <table className="rc-table" style={{ width: '100%', minWidth: '600px' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--surface-base)', boxShadow: '0 1px 0 var(--border-color)' }}>
                      <tr>
                        <th>Batch Name</th>
                        <th>Labour Type</th>
                        <th>Work Category</th>
                        <th>Working Hrs</th>
                        <th>New Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.filter(r => r.configured && r.amount > 0).map((rule, idx) => (
                        <tr key={idx}>
                          <td>{rule.batchName}</td>
                          <td>{rule.labourType}</td>
                          <td>{rule.workCategory}</td>
                          <td>{rule.hours} hrs</td>
                          <td style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>&#x20B9;{rule.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="dialog-footer" style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn-secondary" onClick={() => setShowPreview(false)} disabled={applying}>Cancel</button>
              <button className="btn-primary" onClick={handleApply} disabled={applying}>
                {applying ? 'Applying...' : 'Confirm & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showViewDialog && viewData && (
        <div className="dialog-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <style>{`
            .rm-view-modal {
              width: 100%;
              max-width: 1100px;
              max-height: calc(100vh - 32px);
              display: flex;
              flex-direction: column;
              padding: 0;
              overflow: hidden;
              background: var(--surface-base, #fff);
              border-radius: 8px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            }
            .rm-view-header {
              flex-shrink: 0;
              padding: 1.5rem;
              border-bottom: 1px solid var(--border-color);
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .rm-view-body {
              flex: 1;
              min-height: 0;
              overflow: hidden;
              padding: 1.5rem;
              display: flex;
              flex-direction: column;
              gap: 1.5rem;
            }
            .rm-view-footer {
              flex-shrink: 0;
              padding: 1rem 1.5rem;
              border-top: 1px solid var(--border-color);
              display: flex;
              justify-content: flex-end;
              background: var(--surface-base, #fff);
            }
            .rate-master-view-table-wrapper {
              flex: 1;
              min-height: 0;
              overflow-x: auto;
              overflow-y: auto;
              border: 1px solid var(--border-color);
              border-radius: 4px;
            }
            .rate-master-view-table-wrapper thead {
              position: sticky;
              top: 0;
              z-index: 2;
              background-color: var(--bg-secondary);
            }
            @media (max-width: 768px) {
              .dialog-overlay {
                padding: 0 !important;
              }
              .rm-view-modal {
                max-width: none;
                max-height: none;
                height: 100%;
                border-radius: 0;
              }
            }
          `}</style>
          <div className="rm-view-modal card">
            <div className="rm-view-header">
              <div>
                <h3 style={{ margin: 0 }}>Rate Master Details</h3>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Doc No: {viewData.rateMaster.docNo}
                </div>
              </div>
              <button onClick={() => setShowViewDialog(false)} style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', borderRadius: '4px' }}>&times;</button>
            </div>
            
            <div className="rm-view-body">
              <section>
                <h4 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-muted)' }}>Document Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Effective Date</div>
                    <strong>{formatDate(viewData.rateMaster.effectiveDate)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Status</div>
                    <span className={`badge ${viewData.rateMaster.status === 'Applied' ? 'badge--success' : 'badge--warning'}`}>
                      {viewData.rateMaster.status}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Applied By</div>
                    <strong>{viewData.rateMaster.appliedBy || '-'}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Applied At</div>
                    <strong>{viewData.rateMaster.appliedAt ? formatDate(viewData.rateMaster.appliedAt) : '-'}</strong>
                  </div>
                </div>
              </section>

              <div className="rc-tab-nav" style={{ marginBottom: '0', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem' }}>
                <button 
                  className={`rc-tab-btn ${viewActiveTab === 'rates' ? 'rc-tab-btn--active' : ''}`} 
                  onClick={() => setViewActiveTab('rates')}
                  style={{ background: 'none', border: 'none', borderBottom: viewActiveTab === 'rates' ? '2px solid var(--primary-color)' : '2px solid transparent', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: viewActiveTab === 'rates' ? '600' : '400', color: viewActiveTab === 'rates' ? 'var(--primary-color)' : 'var(--text-muted)' }}
                >
                  Rate Details ({viewData.rateMaster.rules?.length || 0})
                </button>
                <button 
                  className={`rc-tab-btn ${viewActiveTab === 'labourers' ? 'rc-tab-btn--active' : ''}`} 
                  onClick={() => setViewActiveTab('labourers')}
                  style={{ background: 'none', border: 'none', borderBottom: viewActiveTab === 'labourers' ? '2px solid var(--primary-color)' : '2px solid transparent', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: viewActiveTab === 'labourers' ? '600' : '400', color: viewActiveTab === 'labourers' ? 'var(--primary-color)' : 'var(--text-muted)' }}
                >
                  Affected Labourers ({viewData.affectedLabourers?.length || 0})
                </button>
              </div>

              {viewActiveTab === 'rates' && (
                <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <div className="rate-master-view-table-wrapper">
                    <table className="rc-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: '60px' }}>S.No</th>
                          <th>Batch Name</th>
                          <th>Labour Type</th>
                          <th>Work Category</th>
                          <th>Working Hrs</th>
                          <th>New Rate</th>
                          <th>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewData.rateMaster.rules?.map((rule, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td>{rule.batchName}</td>
                            <td>{rule.labourType}</td>
                            <td>{rule.workCategory}</td>
                            <td>{rule.hours} hrs</td>
                            <td><strong>&#x20B9;{rule.amount}</strong></td>
                            <td>{rule.remarks || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {viewActiveTab === 'labourers' && (
                <section style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {viewData.affectedLabourers?.length === 0 ? (
                    <p className="hint-text">No labourers were affected by this rate master.</p>
                  ) : (
                    <div className="rate-master-view-table-wrapper">
                      <table className="rc-table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Batch</th>
                            <th>Labour Type</th>
                            <th>Work Category</th>
                            <th>Working Hrs</th>
                            <th>Old Rate</th>
                            <th>New Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewData.affectedLabourers?.map((labourer, idx) => (
                            <tr key={idx}>
                              <td>
                                <strong>{labourer.name.toUpperCase()}</strong>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{labourer.code}</div>
                              </td>
                              <td>{labourer.batch}</td>
                              <td>{labourer.labourType}</td>
                              <td>{labourer.workCategory}</td>
                              <td>{labourer.newHours || labourer.oldHours || '-'} hrs</td>
                              <td>&#x20B9;{labourer.oldRate}</td>
                              <td style={{ color: 'var(--primary-color)' }}><strong>&#x20B9;{labourer.newRate}</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>

            <div className="rm-view-footer" style={{ gap: '0.75rem' }}>
              <button className="btn-secondary" onClick={handleDownloadView} disabled={exportingExcel}>
                {exportingExcel ? 'Downloading…' : 'Download Excel'}
              </button>
              <button className="btn-secondary" onClick={() => setShowViewDialog(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {labourerListMode && (
        <div className="dialog-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="rm-view-modal card">
            <div className="rm-view-header">
              <div>
                <h3 style={{ margin: 0 }}>
                  {labourerListMode === 'applicable' ? 'Applicable Labourers' : 'Not Applicable Labourers'}
                </h3>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {labourerListMode === 'applicable'
                    ? `Have Batch, Labour Type, and Work Category (${applicableLabourers.length})`
                    : `Missing Batch, Labour Type, or Work Category (${notApplicableLabourers.length})`}
                </div>
              </div>
              <button onClick={() => setLabourerListMode(null)} style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', borderRadius: '4px' }}>&times;</button>
            </div>
            <div className="rm-view-body">
              {labourerListMode === 'applicable' ? (
                applicableLabourers.length === 0 ? (
                  <p className="hint-text">No labourers currently have Batch, Labour Type, and Work Category.</p>
                ) : (
                  <div className="rate-master-view-table-wrapper">
                    <table className="rc-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: '60px' }}>S.No</th>
                          <th>Name</th>
                          <th>Code</th>
                          <th>Batch</th>
                          <th>Labour Type</th>
                          <th>Work Category</th>
                          <th>Working Hrs</th>
                          <th>Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {applicableLabourers.map((labourer, idx) => (
                          <tr key={labourer.id || labourer.code || idx}>
                            <td>{idx + 1}</td>
                            <td><strong>{labourer.name}</strong></td>
                            <td>{labourer.code}</td>
                            <td>{labourer.batchName || '—'}</td>
                            <td>{labourer.labourType || '—'}</td>
                            <td>{labourer.workCategory || '—'}</td>
                            <td>{labourer.currentHours || labourer.workingHours || '—'}</td>
                            <td>&#x20B9;{labourer.currentRate || labourer.payAmount || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : notApplicableLabourers.length === 0 ? (
                <p className="hint-text">No labourers are missing Batch, Labour Type, or Work Category.</p>
              ) : (
                <div className="rate-master-view-table-wrapper">
                  <table className="rc-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>S.No</th>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Batch</th>
                        <th>Labour Type</th>
                        <th>Work Category</th>
                        <th>Missing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notApplicableLabourers.map((labourer, idx) => (
                        <tr key={labourer.id || labourer.code || idx}>
                          <td>{idx + 1}</td>
                          <td><strong>{labourer.name}</strong></td>
                          <td>{labourer.code}</td>
                          <td>{labourer.batchName || '—'}</td>
                          <td>{labourer.labourType || '—'}</td>
                          <td>{labourer.workCategory || '—'}</td>
                          <td>
                            {(labourer.missing || []).map((field) => (
                              <span key={field} className="badge badge--warning" style={{ marginRight: '0.35rem' }}>{field}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="rm-view-footer" style={{ gap: '0.75rem' }}>
              <button
                className="btn-secondary"
                onClick={() => handleDownloadExcel({
                  docNo: labourerListMode === 'applicable' ? 'Applicable Labourers' : 'Not Applicable Labourers',
                  status: labourerListMode === 'applicable' ? 'Applicable' : 'Not Applicable',
                  rules: [],
                  applicableLabourers,
                  notApplicableLabourers,
                })}
                disabled={exportingExcel}
              >
                {exportingExcel ? 'Downloading…' : 'Download Excel'}
              </button>
              <button className="btn-secondary" onClick={() => setLabourerListMode(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
