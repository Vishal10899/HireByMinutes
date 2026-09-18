import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { JobApplication, JobApplicationStatus, JobApplicationStatusHistory } from '../../types';
import { Button } from '../common/Button';
import {
  FileText,
  Search,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Clock,
  Briefcase,
  User,
  MapPin,
  Mail,
  ShieldCheck,
  AlertCircle,
  X,
  History,
  Check,
  ChevronRight
} from 'lucide-react';

export const AdminJobApplicationsControl: React.FC = () => {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  // Application Detail Modal
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [appHistory, setAppHistory] = useState<JobApplicationStatusHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [newStatus, setNewStatus] = useState<JobApplicationStatus>('Submitted');
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminJobApplications({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search.trim() || undefined,
        limit: 100
      });
      setApplications(res.applications || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadApplications();
  };

  const handleOpenDetail = async (app: JobApplication) => {
    setSelectedApp(app);
    setNewStatus(app.status);
    setAdminNotes(app.admin_notes || '');
    setLoadingHistory(true);
    try {
      const detail = await api.getAdminJobApplication(app.id);
      setSelectedApp(detail.application);
      setAppHistory(detail.history || []);
    } catch (err) {
      console.error('Failed to load application history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setUpdating(true);
    try {
      await api.updateAdminJobApplicationStatus(selectedApp.id, newStatus, adminNotes);
      await loadApplications();
      // Reload detail
      const detail = await api.getAdminJobApplication(selectedApp.id);
      setSelectedApp(detail.application);
      setAppHistory(detail.history || []);
      alert('Application status updated successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to update application status');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'Submitted':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'Under Review':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Shortlisted':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'Interview':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case 'Hired':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Rejected':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'Withdrawn':
        return 'bg-zinc-100 text-zinc-600 border-zinc-200';
      default:
        return 'bg-aliceblue text-midnight border-timberwolf/60';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-timberwolf/70 p-6 shadow-card">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-moonstone/10 text-moonstone-dark text-[11px] font-bold border border-moonstone/30 mb-2">
            <FileText className="w-3.5 h-3.5 text-moonstone" />
            <span>Applicant Tracking Pipeline</span>
          </div>
          <h1 className="text-2xl font-extrabold text-midnight tracking-tight">
            Job Applications & Resumes
          </h1>
          <p className="text-xs text-midnight/70 mt-1">
            Review candidate qualifications, access secure resumes, update recruitment milestones, and track status timelines.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadApplications}
            disabled={loading}
            className="p-2.5 rounded-xl border border-timberwolf/70 bg-aliceblue hover:bg-white text-midnight transition-colors cursor-pointer"
            title="Reload applications"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-moonstone' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-timberwolf/70 shadow-subtle">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-midnight/40 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidate name, email, job, or company..."
            className="w-full pl-9 pr-3 py-2 bg-aliceblue/60 border border-timberwolf/70 rounded-xl text-xs text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-1.5 text-xs font-semibold text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="Submitted">Submitted</option>
            <option value="Under Review">Under Review</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Interview">Interview</option>
            <option value="Hired">Hired</option>
            <option value="Rejected">Rejected</option>
            <option value="Withdrawn">Withdrawn</option>
          </select>
        </div>
      </div>

      {/* Applications Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-timberwolf/60 p-6 h-24 animate-pulse" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-timberwolf/70 p-12 text-center shadow-card space-y-3 max-w-md mx-auto">
          <FileText className="w-10 h-10 text-moonstone mx-auto" />
          <h3 className="text-base font-bold text-midnight">No Applications Found</h3>
          <p className="text-xs text-midnight/70">
            {search || statusFilter !== 'all'
              ? 'No candidate applications match your current search and filter settings.'
              : 'No applications have been submitted by candidates yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-timberwolf/70 overflow-x-auto shadow-subtle">
          <table className="w-full text-left text-xs">
            <thead className="bg-aliceblue/60 text-midnight/60 uppercase font-semibold border-b border-timberwolf/40">
              <tr>
                <th className="py-3.5 px-4">Applicant</th>
                <th className="py-3.5 px-4">Position</th>
                <th className="py-3.5 px-4">Company</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Applied Date</th>
                <th className="py-3.5 px-4 text-right">Review Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-timberwolf/30 text-midnight/80">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-aliceblue/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={app.applicant_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${app.applicant_name}`}
                        alt={app.applicant_name || ''}
                        className="w-8 h-8 rounded-full object-cover border border-timberwolf/60 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-midnight block truncate">
                          {app.applicant_name || 'Candidate'}
                        </span>
                        <span className="text-[11px] text-midnight/60 block truncate">
                          {app.applicant_email}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-midnight block truncate max-w-[200px]">
                      {app.job_title}
                    </span>
                    <span className="text-[11px] text-midnight/60 block">
                      {app.work_mode || 'Full-time'}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 font-medium text-midnight">
                    {app.company_name}
                  </td>

                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getStatusBadge(app.status)}`}>
                      {app.status}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-midnight/60">
                    {new Date(app.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => handleOpenDetail(app)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-aliceblue hover:bg-midnight hover:text-white text-midnight text-xs font-semibold border border-timberwolf/60 transition-all cursor-pointer shadow-2xs"
                    >
                      <span>Review</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Application Detail & Status Transition Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-timberwolf/70 shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between pb-4 border-b border-timberwolf/40">
              <div className="flex items-center gap-3">
                <img
                  src={selectedApp.applicant_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedApp.applicant_name}`}
                  alt={selectedApp.applicant_name || ''}
                  className="w-12 h-12 rounded-2xl object-cover border border-lightblue shrink-0 shadow-xs"
                />
                <div>
                  <h3 className="text-lg font-bold text-midnight">{selectedApp.applicant_name}</h3>
                  <div className="flex items-center gap-2 text-xs text-midnight/60">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-moonstone" />
                      <span>{selectedApp.applicant_email}</span>
                    </span>
                    {selectedApp.applicant_country && (
                      <span>• {selectedApp.applicant_country}</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedApp(null)}
                className="p-1 rounded-xl text-midnight/50 hover:text-midnight hover:bg-aliceblue cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Job Summary */}
            <div className="bg-aliceblue/60 rounded-2xl p-4 border border-timberwolf/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-midnight/50">Target Position</span>
                <h4 className="font-bold text-sm text-midnight mt-0.5">{selectedApp.job_title}</h4>
                <span className="text-midnight/70">{selectedApp.company_name} • {selectedApp.work_mode || 'Full-time'}</span>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border self-start sm:self-center ${getStatusBadge(selectedApp.status)}`}>
                {selectedApp.status}
              </span>
            </div>

            {/* Candidate Submission Details */}
            <div className="space-y-4 text-xs">
              {/* Resume Document Link */}
              <div>
                <label className="block font-bold text-midnight mb-1.5">Submitted Resume</label>
                {selectedApp.resume_url ? (
                  <a
                    href={api.getJobApplicationResumeUrl(selectedApp.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-timberwolf/70 hover:border-moonstone text-midnight font-bold transition-all shadow-xs cursor-pointer group"
                  >
                    <FileText className="w-4 h-4 text-moonstone group-hover:scale-110 transition-transform" />
                    <span>View / Download Resume Document</span>
                    <ExternalLink className="w-3.5 h-3.5 text-midnight/50 ml-1" />
                  </a>
                ) : (
                  <span className="text-midnight/50 italic">No resume file attached</span>
                )}
              </div>

              {/* Relevant Experience */}
              {selectedApp.relevant_experience && (
                <div>
                  <label className="block font-bold text-midnight mb-1">Relevant Experience</label>
                  <div className="p-3 bg-aliceblue/40 rounded-xl border border-timberwolf/40 text-midnight/80">
                    {selectedApp.relevant_experience}
                  </div>
                </div>
              )}

              {/* Key Skills */}
              {Array.isArray(selectedApp.skills) && selectedApp.skills.length > 0 && (
                <div>
                  <label className="block font-bold text-midnight mb-1.5">Claimed Skills</label>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedApp.skills.map((s, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-0.5 rounded-lg bg-aliceblue border border-timberwolf/60 font-medium text-midnight"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cover Note */}
              {selectedApp.cover_note && (
                <div>
                  <label className="block font-bold text-midnight mb-1">Cover Note / Pitch</label>
                  <div className="p-3 bg-aliceblue/40 rounded-xl border border-timberwolf/40 text-midnight/80 whitespace-pre-line leading-relaxed">
                    {selectedApp.cover_note}
                  </div>
                </div>
              )}
            </div>

            {/* Status Transition & Admin Notes Form */}
            <form onSubmit={handleUpdateStatus} className="pt-4 border-t border-timberwolf/40 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Recruitment Milestone / Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs font-bold text-midnight focus:outline-none focus:border-moonstone cursor-pointer"
                  >
                    <option value="Submitted">Submitted</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Shortlisted">Shortlisted</option>
                    <option value="Interview">Interview</option>
                    <option value="Hired">Hired</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Withdrawn">Withdrawn</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-midnight mb-1">
                    Internal Admin / Reviewer Notes
                  </label>
                  <input
                    type="text"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="e.g. Cleared technical screening, scheduled panel"
                    className="w-full bg-aliceblue/60 border border-timberwolf/70 rounded-xl px-3 py-2 text-xs text-midnight focus:outline-none focus:border-moonstone"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={updating}
                  className="w-full sm:w-auto"
                >
                  {updating ? 'Updating Status...' : 'Save Application Decision'}
                </Button>
              </div>
            </form>

            {/* Status History Timeline */}
            <div className="pt-4 border-t border-timberwolf/40 space-y-3">
              <h4 className="text-xs font-bold text-midnight uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-moonstone" />
                <span>Review Milestone Audit History</span>
              </h4>

              {loadingHistory ? (
                <div className="text-xs text-midnight/50 italic">Loading timeline...</div>
              ) : appHistory.length === 0 ? (
                <div className="text-xs text-midnight/50 italic">No milestone changes recorded.</div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {appHistory.map((h) => (
                    <div
                      key={h.id}
                      className="p-2.5 rounded-xl bg-aliceblue/50 border border-timberwolf/40 text-xs flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-midnight">
                          {h.previous_status && <span>{h.previous_status} → </span>}
                          <span className="text-moonstone">{h.new_status}</span>
                        </div>
                        {h.notes && (
                          <p className="text-[11px] text-midnight/70 mt-0.5">{h.notes}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-midnight/50 shrink-0">
                        {new Date(h.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
