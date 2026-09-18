import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Job, JobApplication } from '../types';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { usePageSEO } from '../hooks/usePageSEO';
import {
  Briefcase,
  MapPin,
  Building2,
  DollarSign,
  Clock,
  ArrowLeft,
  Calendar,
  Share2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Upload,
  X,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  Check,
  Lock
} from 'lucide-react';

export const JobDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [myApplication, setMyApplication] = useState<JobApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Application Modal state
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string>('');
  const [resumeName, setResumeName] = useState<string>('');
  const [coverNote, setCoverNote] = useState('');
  const [relevantExperience, setRelevantExperience] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    async function loadJob() {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getJob(id);
        setJob(res.job);
        setHasApplied(Boolean(res.has_applied));
        setMyApplication(res.my_application || null);
      } catch (err: any) {
        console.error('Failed to load job', err);
        setError(err.message || 'Job position not found');
      } finally {
        setLoading(false);
      }
    }
    loadJob();
  }, [id, user]);

  const companyName = job?.company?.name || job?.company_name || 'HireByMinute Employer';
  const pageTitle = job ? `${job.title} at ${companyName} — HireByMinute` : 'Job Opening — HireByMinute';
  const pageDesc = job ? `${job.title} full-time opportunity at ${companyName}. ${job.description.slice(0, 150)}...` : 'Full-time employment opportunity on HireByMinute.';

  usePageSEO({
    title: pageTitle,
    description: pageDesc,
    canonicalPath: job ? `/jobs/${job.slug || job.id}` : '/jobs'
  });

  // Inject Google JobPosting JSON-LD Schema
  useEffect(() => {
    if (!job) return;

    const schemaId = 'jobposting-jsonld';
    let scriptTag = document.getElementById(schemaId) as HTMLScriptElement | null;
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = schemaId;
      scriptTag.type = 'application/ld+json';
      document.head.appendChild(scriptTag);
    }

    const jobPostingSchema: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: job.title,
      description: job.description,
      datePosted: job.published_at || job.created_at || new Date().toISOString(),
      employmentType: 'FULL_TIME',
      hiringOrganization: {
        '@type': 'Organization',
        name: companyName,
        sameAs: job.company?.website || undefined,
        logo: job.company?.logo_url || undefined
      },
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressLocality: job.city || undefined,
          addressCountry: job.country || 'Global'
        }
      }
    };

    if (job.application_deadline) {
      jobPostingSchema.validThrough = new Date(job.application_deadline).toISOString();
    }

    if (job.salary_min || job.salary_max) {
      jobPostingSchema.baseSalary = {
        '@type': 'MonetaryAmount',
        currency: job.currency || 'USD',
        value: {
          '@type': 'QuantitativeValue',
          minValue: job.salary_min || undefined,
          maxValue: job.salary_max || undefined,
          unitText: 'YEAR'
        }
      };
    }

    scriptTag.text = JSON.stringify(jobPostingSchema);

    return () => {
      const el = document.getElementById(schemaId);
      if (el) el.remove();
    };
  }, [job, companyName]);

  const handleResumeFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) {
      setApplyError('Only PDF, DOC, or DOCX documents are accepted.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setApplyError('Document size must not exceed 5MB.');
      return;
    }

    setResumeFile(file);
    setResumeName(file.name);
    setApplyError(null);
    setUploadingResume(true);

    try {
      const uploadRes = await api.uploadResume(file);
      setResumeUrl(uploadRes.url);
    } catch (err: any) {
      setApplyError(err.message || 'Failed to upload resume document');
      setResumeFile(null);
      setResumeName('');
    } finally {
      setUploadingResume(false);
    }
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;

    if (!user) {
      navigate(`/auth?redirect=/jobs/${job.slug || job.id}`);
      return;
    }

    if (!resumeUrl) {
      setApplyError('Please upload your resume document to proceed.');
      return;
    }

    setSubmitting(true);
    setApplyError(null);

    try {
      const skillsArray = skillsInput
        ? skillsInput.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      await api.applyJob(job.id, {
        resume_url: resumeUrl,
        cover_note: coverNote.trim(),
        relevant_experience: relevantExperience.trim(),
        skills: skillsArray
      });

      setApplySuccess(true);
      setHasApplied(true);
      setMyApplication({
        id: 'new',
        job_id: job.id,
        applicant_id: user.id,
        resume_url: resumeUrl,
        cover_note: coverNote,
        relevant_experience: relevantExperience,
        skills: skillsArray,
        status: 'Submitted',
        created_at: new Date().toISOString()
      });
    } catch (err: any) {
      setApplyError(err.message || 'Failed to submit your application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: pageTitle,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const isClosedOrExpired = Boolean(
    job && (job.status === 'closed' || (job.application_deadline && new Date(job.application_deadline) < new Date()))
  );

  const formatSalary = (j: Job) => {
    if (j.salary_type === 'undisclosed' || (!j.salary_min && !j.salary_max)) {
      return 'Salary Undisclosed';
    }
    const curr = j.currency || 'USD';
    const sym = curr === 'USD' ? '$' : `${curr} `;
    if (j.salary_type === 'starting_from' && j.salary_min) {
      return `From ${sym}${Number(j.salary_min).toLocaleString()} / year`;
    }
    if (j.salary_type === 'up_to' && j.salary_max) {
      return `Up to ${sym}${Number(j.salary_max).toLocaleString()} / year`;
    }
    if (j.salary_min && j.salary_max) {
      return `${sym}${Number(j.salary_min).toLocaleString()} - ${sym}${Number(j.salary_max).toLocaleString()} / year`;
    }
    if (j.salary_min) {
      return `${sym}${Number(j.salary_min).toLocaleString()} / year`;
    }
    return 'Competitive';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-aliceblue py-14 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="h-6 w-32 bg-white/70 rounded-lg animate-pulse mb-8" />
        <div className="bg-white rounded-3xl border border-timberwolf/60 p-8 sm:p-12 space-y-6 animate-pulse">
          <div className="h-8 w-2/3 bg-aliceblue rounded-xl" />
          <div className="h-4 w-1/3 bg-aliceblue rounded-lg" />
          <div className="h-32 bg-aliceblue/60 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-aliceblue py-20 max-w-xl mx-auto px-4 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-white border border-timberwolf/60 text-midnight/60 mx-auto flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-moonstone" />
        </div>
        <h2 className="text-2xl font-bold text-midnight">Job Position Unavailable</h2>
        <p className="text-sm text-midnight/70 leading-relaxed">
          {error || 'This job opening does not exist or has been removed from the platform.'}
        </p>
        <div className="pt-2">
          <Button to="/jobs" variant="primary" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to All Openings
          </Button>
        </div>
      </div>
    );
  }

  const companyLogo = job.company?.logo_url || job.company_logo;
  const locationDisplay = job.location_text || [job.city, job.country].filter(Boolean).join(', ') || 'Global';

  return (
    <div className="min-h-screen bg-aliceblue text-midnight pb-24">
      {/* Top Breadcrumb Nav */}
      <div className="bg-white border-b border-timberwolf/60 py-3.5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link
            to="/jobs"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-midnight/70 hover:text-moonstone transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Jobs</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-timberwolf/70 bg-aliceblue hover:bg-white text-xs font-medium text-midnight transition-colors cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Link Copied</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-midnight/60" />
                  <span>Share Position</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10">
        
        {/* Closed or Expired Warning Banner */}
        {isClosedOrExpired && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3 text-xs sm:text-sm font-medium">
            <Clock className="w-5 h-5 text-amber-600 shrink-0" />
            <span>This position is no longer accepting new applications. You can still view details for reference.</span>
          </div>
        )}

        {/* Existing Application Status Banner */}
        {hasApplied && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 text-xs sm:text-sm font-medium">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                You submitted an application for this position on{' '}
                {myApplication?.created_at ? new Date(myApplication.created_at).toLocaleDateString() : 'recently'}.
              </span>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-600 text-white font-bold text-xs">
              Status: {myApplication?.status || 'Submitted'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Job Details (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Header Card */}
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-aliceblue border border-timberwolf/60 flex items-center justify-center font-bold text-midnight text-xl shrink-0 overflow-hidden shadow-xs">
                  {companyLogo ? (
                    <img src={companyLogo} alt={companyName} className="w-full h-full object-cover" />
                  ) : (
                    companyName.slice(0, 2).toUpperCase()
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-midnight/80">{companyName}</span>
                    {Boolean(job.featured) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>Featured</span>
                      </span>
                    )}
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-extrabold text-midnight tracking-tight leading-snug">
                    {job.title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 mt-3 text-xs sm:text-sm text-midnight/70">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4 text-moonstone" />
                      <span>{locationDisplay}</span>
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-midnight">
                      <DollarSign className="w-4 h-4 text-moonstone" />
                      <span>{formatSalary(job)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4 text-midnight/40" />
                      <span>{job.experience_level}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Badges Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 border-t border-timberwolf/40">
                <div className="bg-aliceblue rounded-xl p-3 border border-timberwolf/50 text-center">
                  <span className="block text-[10px] uppercase font-bold text-midnight/50">Employment</span>
                  <span className="text-xs font-bold text-midnight mt-0.5 block">{job.employment_type || 'Full-time'}</span>
                </div>
                <div className="bg-aliceblue rounded-xl p-3 border border-timberwolf/50 text-center">
                  <span className="block text-[10px] uppercase font-bold text-midnight/50">Work Mode</span>
                  <span className="text-xs font-bold text-midnight mt-0.5 block">{job.work_mode}</span>
                </div>
                <div className="bg-aliceblue rounded-xl p-3 border border-timberwolf/50 text-center">
                  <span className="block text-[10px] uppercase font-bold text-midnight/50">Experience</span>
                  <span className="text-xs font-bold text-midnight mt-0.5 block">{job.experience_level}</span>
                </div>
                <div className="bg-aliceblue rounded-xl p-3 border border-timberwolf/50 text-center">
                  <span className="block text-[10px] uppercase font-bold text-midnight/50">Published</span>
                  <span className="text-xs font-bold text-midnight mt-0.5 block">
                    {job.published_at ? new Date(job.published_at).toLocaleDateString() : 'Recently'}
                  </span>
                </div>
              </div>
            </div>

            {/* Job Description */}
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 sm:p-8 shadow-card space-y-6">
              <div>
                <h2 className="text-lg font-bold text-midnight mb-3">About the Role</h2>
                <div className="text-sm text-midnight/80 leading-relaxed whitespace-pre-line">
                  {job.description}
                </div>
              </div>

              {/* Responsibilities */}
              {Array.isArray(job.responsibilities) && job.responsibilities.length > 0 && (
                <div className="pt-6 border-t border-timberwolf/40">
                  <h3 className="text-base font-bold text-midnight mb-3">Key Responsibilities</h3>
                  <ul className="space-y-2 text-sm text-midnight/80">
                    {job.responsibilities.map((r, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-moonstone mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Requirements */}
              {Array.isArray(job.requirements) && job.requirements.length > 0 && (
                <div className="pt-6 border-t border-timberwolf/40">
                  <h3 className="text-base font-bold text-midnight mb-3">Requirements & Qualifications</h3>
                  <ul className="space-y-2 text-sm text-midnight/80">
                    {job.requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-moonstone mt-0.5 shrink-0" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Required Skills */}
              {Array.isArray(job.skills) && job.skills.length > 0 && (
                <div className="pt-6 border-t border-timberwolf/40">
                  <h3 className="text-base font-bold text-midnight mb-3">Target Skills & Technologies</h3>
                  <div className="flex flex-wrap gap-2">
                    {job.skills.map((skill, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-xl bg-aliceblue border border-timberwolf/70 text-xs font-semibold text-midnight"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Benefits */}
              {Array.isArray(job.benefits) && job.benefits.length > 0 && (
                <div className="pt-6 border-t border-timberwolf/40">
                  <h3 className="text-base font-bold text-midnight mb-3">Benefits & Perks</h3>
                  <ul className="space-y-2 text-sm text-midnight/80">
                    {job.benefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar (Right col: Company Card & Sticky Apply Box) */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Action Card */}
            <div className="bg-white rounded-3xl border border-timberwolf/70 p-6 shadow-card space-y-5 sticky top-24">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-midnight/60">Career Application</span>
                <h3 className="text-xl font-bold text-midnight mt-1">{job.title}</h3>
                <p className="text-xs text-midnight/70 mt-1">{companyName} • {job.work_mode}</p>
              </div>

              <div className="pt-3 border-t border-timberwolf/40 space-y-3">
                {hasApplied ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <span className="block text-sm font-bold text-emerald-900">Application Submitted</span>
                    <span className="block text-xs text-emerald-700">
                      Your resume and profile have been delivered to the hiring team.
                    </span>
                    <div className="pt-1">
                      <Button to="/client" variant="outline" size="sm" className="w-full text-xs">
                        View Status in Dashboard
                      </Button>
                    </div>
                  </div>
                ) : isClosedOrExpired ? (
                  <Button disabled variant="outline" size="md" className="w-full text-xs font-semibold">
                    Position Closed
                  </Button>
                ) : (
                  <Button
                    onClick={() => setApplyModalOpen(true)}
                    variant="primary"
                    size="md"
                    className="w-full text-sm font-bold py-3.5 shadow-subtle"
                    iconRight={<Briefcase className="w-4 h-4" />}
                  >
                    Apply for this Position
                  </Button>
                )}

                <div className="flex items-center gap-2 text-[11px] text-midnight/60 justify-center pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-moonstone" />
                  <span>Verified employer • Free to apply</span>
                </div>
              </div>

              {/* Company Info Box */}
              <div className="pt-5 border-t border-timberwolf/40 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-midnight/60">Hiring Organization</h4>
                <div className="space-y-2 text-xs text-midnight/80">
                  <div className="flex items-center justify-between">
                    <span className="text-midnight/60">Company:</span>
                    <span className="font-semibold text-midnight">{companyName}</span>
                  </div>
                  {job.company?.industry && (
                    <div className="flex items-center justify-between">
                      <span className="text-midnight/60">Industry:</span>
                      <span className="font-semibold text-midnight">{job.company.industry}</span>
                    </div>
                  )}
                  {job.company?.company_size && (
                    <div className="flex items-center justify-between">
                      <span className="text-midnight/60">Company Size:</span>
                      <span className="font-semibold text-midnight">{job.company.company_size}</span>
                    </div>
                  )}
                  {job.company?.website && (
                    <div className="flex items-center justify-between">
                      <span className="text-midnight/60">Website:</span>
                      <a
                        href={job.company.website.startsWith('http') ? job.company.website : `https://${job.company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-moonstone hover:underline inline-flex items-center gap-1"
                      >
                        <span>Visit Site</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>

                {job.company?.description && (
                  <p className="text-xs text-midnight/70 pt-2 border-t border-timberwolf/30 leading-relaxed">
                    {job.company.description}
                  </p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Application Modal */}
      {applyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-timberwolf/70 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5">
            <div className="flex items-start justify-between pb-4 border-b border-timberwolf/40">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-moonstone">Application Form</span>
                <h3 className="text-xl font-bold text-midnight mt-0.5">{job.title}</h3>
                <span className="text-xs text-midnight/60">{companyName}</span>
              </div>
              <button
                onClick={() => setApplyModalOpen(false)}
                className="p-1 rounded-xl text-midnight/50 hover:text-midnight hover:bg-aliceblue"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!user ? (
              <div className="py-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-aliceblue text-moonstone mx-auto flex items-center justify-center">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-midnight">Sign in to Submit Your Application</h4>
                <p className="text-xs text-midnight/70 max-w-sm mx-auto leading-relaxed">
                  An account is required so you can track review milestones, updates, and interview communications securely.
                </p>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <Button to={`/auth?redirect=/jobs/${job.slug || job.id}`} variant="primary" size="sm">
                    Sign In or Create Account
                  </Button>
                </div>
              </div>
            ) : applySuccess ? (
              <div className="py-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center border-2 border-emerald-200">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-xl font-extrabold text-midnight">Application Submitted!</h4>
                <p className="text-xs text-midnight/70 max-w-sm mx-auto leading-relaxed">
                  Your resume and application have been submitted to {companyName}. You can track review progress at any time in your candidate dashboard.
                </p>
                <div className="pt-3">
                  <Button
                    onClick={() => setApplyModalOpen(false)}
                    variant="primary"
                    size="sm"
                    className="w-full"
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleApplySubmit} className="space-y-4">
                {applyError && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{applyError}</span>
                  </div>
                )}

                {/* Candidate Info Summary */}
                <div className="bg-aliceblue rounded-2xl p-3.5 border border-timberwolf/50 flex items-center gap-3">
                  <img
                    src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.full_name}`}
                    alt={user.full_name}
                    className="w-10 h-10 rounded-xl object-cover border border-lightblue"
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <span className="font-bold text-midnight block truncate">{user.full_name}</span>
                    <span className="text-midnight/60 block truncate">{user.email}</span>
                  </div>
                </div>

                {/* Resume Upload Dropzone */}
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1.5">
                    Resume Document <span className="text-red-500">*</span>
                  </label>
                  <div className="relative border-2 border-dashed border-timberwolf/80 hover:border-moonstone rounded-2xl p-4 text-center bg-aliceblue/40 transition-colors">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={handleResumeFileSelect}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={uploadingResume}
                    />
                    <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                      <Upload className="w-5 h-5 text-moonstone" />
                      {uploadingResume ? (
                        <span className="text-xs font-semibold text-moonstone animate-pulse">
                          Uploading and verifying document...
                        </span>
                      ) : resumeName ? (
                        <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>{resumeName}</span>
                        </span>
                      ) : (
                        <>
                          <span className="text-xs font-semibold text-midnight">
                            Click to browse or drop your resume here
                          </span>
                          <span className="text-[11px] text-midnight/50">
                            PDF, DOC, DOCX up to 5MB
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Relevant Experience */}
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1.5">
                    Relevant Experience & Background
                  </label>
                  <input
                    type="text"
                    value={relevantExperience}
                    onChange={(e) => setRelevantExperience(e.target.value)}
                    placeholder="e.g. 5+ years building distributed React/Node systems"
                    className="w-full bg-white border border-timberwolf/80 rounded-xl px-3 py-2 text-xs text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone"
                  />
                </div>

                {/* Key Skills */}
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1.5">
                    Key Skills (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={skillsInput}
                    onChange={(e) => setSkillsInput(e.target.value)}
                    placeholder="e.g. TypeScript, PostgreSQL, Docker, AWS"
                    className="w-full bg-white border border-timberwolf/80 rounded-xl px-3 py-2 text-xs text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone"
                  />
                </div>

                {/* Cover Note */}
                <div>
                  <label className="block text-xs font-bold text-midnight mb-1.5">
                    Cover Note / Message to Employer
                  </label>
                  <textarea
                    rows={3}
                    value={coverNote}
                    onChange={(e) => setCoverNote(e.target.value)}
                    placeholder="Why are you a great fit for this position? Share highlights of your recent impact..."
                    className="w-full bg-white border border-timberwolf/80 rounded-xl p-3 text-xs text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone resize-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-timberwolf/40">
                  <Button
                    type="button"
                    onClick={() => setApplyModalOpen(false)}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={submitting || uploadingResume || !resumeUrl}
                  >
                    {submitting ? 'Submitting Application...' : 'Send Application'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
