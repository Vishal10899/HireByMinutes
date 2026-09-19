import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { Session, Message } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import {
  Clock,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Send,
  Paperclip,
  Star,
  FileText,
  AlertTriangle,
  CheckCircle,
  Download,
  Share2,
  Sparkles,
  ArrowLeft,
  User,
  Monitor,
  Radio,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { usePageSEO } from '../hooks/usePageSEO';
import { formatINR, CURRENCY } from '../utils/currency';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export const SessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  usePageSEO({
    title: 'Live Consultation Session — HireByMinute',
    noindex: true,
    canonicalPath: `/session/${id || ''}`
  });

  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [uploadingFile, setUploadingFile] = useState(false);

  // WebRTC & Media States
  const [hasMediaAccess, setHasMediaAccess] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [remoteHasAudio, setRemoteHasAudio] = useState(true);
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [callEndedManually, setCallEndedManually] = useState(false);

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Session Extension state
  const [extending, setExtending] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);

  // Mobile Segmented Workspace Tab (Section 15)
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<'video' | 'chat'>('video');

  // DOM & Media Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch Session Data
  const loadSession = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await api.getSession(id);
      setSession(data.session);
      setMessages(data.messages || []);
      setRemainingSeconds(data.session.remainingSeconds || 0);

      if (data.session.status === 'COMPLETED' && data.session.client_id === user?.id) {
        setShowReviewModal(true);
      }
    } catch (err: any) {
      console.error('Error fetching session', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [id, user?.id]);

  // 2. WebRTC Media Stream & PeerConnection Setup
  useEffect(() => {
    const isSessionActive = session?.status === 'ACTIVE' && remainingSeconds > 0 && !callEndedManually;
    if (!isSessionActive || !socket || !id || !user) {
      cleanupWebRTC();
      return;
    }

    let isMounted = true;

    async function initMediaAndWebRTC() {
      try {
        let stream: MediaStream | null = null;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          } catch (e) {
            console.warn('Camera/Mic permission not granted or unavailable, trying audio-only:', e);
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (errAudio) {
              console.warn('Audio device also unavailable:', errAudio);
            }
          }
        }

        if (!isMounted) {
          stream?.getTracks().forEach(t => t.stop());
          return;
        }

        if (stream) {
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          setHasMediaAccess(true);
          setVideoEnabled(stream.getVideoTracks().length > 0);
          setMicEnabled(stream.getAudioTracks().length > 0);
        }

        // Dynamically fetch authoritative STUN/TURN ICE servers from backend
        let activeIceConfig: RTCConfiguration = ICE_SERVERS;
        if (id) {
          try {
            const iceRes = await api.getSessionIceServers(id);
            if (iceRes?.iceServers && iceRes.iceServers.length > 0) {
              activeIceConfig = { iceServers: iceRes.iceServers };
            }
          } catch (iceErr) {
            console.warn('[WebRTC] Could not load dynamic ICE config, falling back to STUN:', iceErr);
          }
        }

        // Initialize RTCPeerConnection with authoritative STUN/TURN servers
        const pc = new RTCPeerConnection(activeIceConfig);
        peerConnectionRef.current = pc;

        if (stream) {
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });
        }

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = event.streams[0];
            }
            setIsPeerConnected(true);
            const videoTracks = event.streams[0].getVideoTracks();
            setRemoteHasVideo(videoTracks.length > 0 && videoTracks[0].enabled);
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && socket && user) {
            socket.emit('webrtc_ice_candidate', {
              sessionId: id,
              candidate: event.candidate,
              senderId: user.id
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setIsPeerConnected(true);
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            setIsPeerConnected(false);
          }
        };

        // If client, create initial offer
        if (session && user && socket && user.id === session.client_id) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc_offer', {
            sessionId: id,
            offer,
            senderId: user.id
          });
        }
      } catch (err) {
        console.error('Failed to initialize WebRTC peer connection:', err);
      }
    }

    initMediaAndWebRTC();

    return () => {
      isMounted = false;
      cleanupWebRTC();
    };
  }, [session?.status, remainingSeconds > 0, callEndedManually, socket, id, user?.id]);

  // WebRTC Cleanup
  const cleanupWebRTC = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setIsPeerConnected(false);
    setScreenSharing(false);
  };

  // 3. Socket Event Handlers
  useEffect(() => {
    if (!socket || !id || !user) return;

    socket.emit('join_session', {
      sessionId: id,
      userId: user.id,
      userName: user.full_name
    });

    // Server-authoritative timer tick
    socket.on('session_tick', (data: { sessionId: string; remainingSeconds: number; status: any }) => {
      if (data.sessionId === id) {
        setRemainingSeconds(data.remainingSeconds);
        setSession((prev) => (prev ? { ...prev, status: data.status, remainingSeconds: data.remainingSeconds } : prev));
      }
    });

    // Warning notification (5m / 1m)
    socket.on('session_warning', (data: { sessionId: string; message: string; secondsLeft: number }) => {
      if (data.sessionId === id) {
        setWarningMessage(data.message);
      }
    });

    // Session Extended real-time sync
    socket.on('session_extended', (data: { sessionId: string; remainingSeconds: number; duration_minutes: number; actual_end: string }) => {
      if (data.sessionId === id) {
        setRemainingSeconds(data.remainingSeconds);
        setWarningMessage(null);
        setSession((prev) => (prev ? { ...prev, duration_minutes: data.duration_minutes, actual_end: data.actual_end, remainingSeconds: data.remainingSeconds } : prev));
      }
    });

    // Session Expired / Cutoff
    socket.on('session_expired', (data: { sessionId: string; message: string }) => {
      if (data.sessionId === id) {
        setRemainingSeconds(0);
        setWarningMessage(data.message);
        setSession((prev) => (prev ? { ...prev, status: 'COMPLETED', canCommunicate: false } : prev));
        cleanupWebRTC();
        confetti({ particleCount: 60, spread: 55 });
      }
    });

    socket.on('session_completed', () => {
      if (user?.role === 'client') {
        setShowReviewModal(true);
      }
    });

    // Real-time Chat message
    socket.on('new_message', (msg: Message) => {
      if (msg.session_id === id) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    // WebRTC Signaling Handlers
    socket.on('webrtc_offer', async ({ offer, senderId }) => {
      if (senderId === user.id) return;
      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc_answer', {
            sessionId: id,
            answer,
            senderId: user.id
          });
        } catch (e) {
          console.error('Error handling WebRTC offer:', e);
        }
      }
    });

    socket.on('webrtc_answer', async ({ answer, senderId }) => {
      if (senderId === user.id) return;
      const pc = peerConnectionRef.current;
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.error('Error handling WebRTC answer:', e);
        }
      }
    });

    socket.on('webrtc_ice_candidate', async ({ candidate, senderId }) => {
      if (senderId === user.id) return;
      const pc = peerConnectionRef.current;
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    });

    socket.on('call_media_state', ({ senderId, audio, video, screenSharing: peerScreen }) => {
      if (senderId === user.id) return;
      setRemoteHasAudio(audio !== undefined ? audio : true);
      setRemoteHasVideo(video || peerScreen || false);
    });

    return () => {
      socket.emit('leave_session', { sessionId: id, userId: user.id });
      socket.off('session_tick');
      socket.off('session_warning');
      socket.off('session_extended');
      socket.off('session_expired');
      socket.off('session_completed');
      socket.off('new_message');
      socket.off('webrtc_offer');
      socket.off('webrtc_answer');
      socket.off('webrtc_ice_candidate');
      socket.off('call_media_state');
    };
  }, [socket, id, user?.id]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 4. Media Controls (Mic, Video, Screen Share, End Call)
  const toggleMicrophone = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !micEnabled;
        audioTracks[0].enabled = nextState;
        setMicEnabled(nextState);
        socket?.emit('call_media_state', {
          sessionId: id,
          senderId: user?.id,
          audio: nextState,
          video: videoEnabled,
          screenSharing
        });
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !videoEnabled;
        videoTracks[0].enabled = nextState;
        setVideoEnabled(nextState);
        socket?.emit('call_media_state', {
          sessionId: id,
          senderId: user?.id,
          audio: micEnabled,
          video: nextState,
          screenSharing
        });
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!screenSharing) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = displayStream.getVideoTracks()[0];

          if (peerConnectionRef.current) {
            const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(screenTrack);
            }
          }

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = displayStream;
          }

          screenTrack.onended = () => {
            stopScreenShare();
          };

          setScreenSharing(true);
          socket?.emit('call_media_state', {
            sessionId: id,
            senderId: user?.id,
            audio: micEnabled,
            video: true,
            screenSharing: true
          });
        }
      } catch (err) {
        console.warn('Screen sharing cancelled or failed:', err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (localStreamRef.current) {
      const originalVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (peerConnectionRef.current && originalVideoTrack) {
        const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(originalVideoTrack);
        }
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
    setScreenSharing(false);
    socket?.emit('call_media_state', {
      sessionId: id,
      senderId: user?.id,
      audio: micEnabled,
      video: videoEnabled,
      screenSharing: false
    });
  };

  const handleEndCall = () => {
    setCallEndedManually(true);
    cleanupWebRTC();
  };

  // 5. Chat & File Upload Handlers
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !id) return;

    try {
      await api.sendMessage(id, inputText.trim());
      setInputText('');
    } catch (err: any) {
      alert(err.message || 'Unable to send message');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    try {
      setUploadingFile(true);
      await api.uploadSessionFile(id, file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      alert(err.message || 'Failed to upload file');
    } finally {
      setUploadingFile(false);
    }
  };

  // 6. Review Handler
  const handleSubmitReview = async () => {
    if (!id) return;
    try {
      await api.submitReview(id, reviewRating, reviewComment);
      setReviewSubmitted(true);
      setShowReviewModal(false);
      confetti({ particleCount: 100, spread: 70 });
    } catch (err: any) {
      alert(err.message || 'Failed to submit review');
    }
  };

  // Explicit End Session by either participant
  const handleEndSessionExplicit = async () => {
    if (!id) return;
    if (!window.confirm('Are you sure you want to end this consultation session now?')) return;
    try {
      await api.endSession(id);
      setRemainingSeconds(0);
      setSession(prev => prev ? { ...prev, status: 'COMPLETED', canCommunicate: false } : prev);
      cleanupWebRTC();
      if (user?.role === 'client') {
        setShowReviewModal(true);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to end session');
    }
  };

  // Seamless Session Extension with Razorpay
  const handleExtendSession = async (additionalMinutes: number) => {
    if (!id || !session) return;
    setExtending(true);
    try {
      const orderRes = await api.createExtensionOrder(id, additionalMinutes);

      const ensureRazorpayLoaded = (): Promise<boolean> => {
        return new Promise((resolve) => {
          if ((window as any).Razorpay) return resolve(true);
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const isLoaded = await ensureRazorpayLoaded();
      if (!isLoaded || !(window as any).Razorpay) {
        throw new Error('Failed to load secure Razorpay payment gateway.');
      }

      const options = {
        key: orderRes.key_id,
        amount: orderRes.amount_paise,
        currency: orderRes.currency || CURRENCY,
        name: 'HireByMinute',
        description: `Extend Consultation: +${additionalMinutes} mins`,
        order_id: orderRes.order_id,
        prefill: {
          name: user?.full_name || '',
          email: user?.email || ''
        },
        theme: {
          color: '#004554'
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await api.verifyExtensionPayment(id, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              additional_minutes: additionalMinutes
            });

            if (verifyRes.session) {
              setSession(prev => prev ? { ...prev, ...verifyRes.session } : verifyRes.session);
              if (verifyRes.session.remainingSeconds !== undefined) {
                setRemainingSeconds(verifyRes.session.remainingSeconds);
              }
            }
            setWarningMessage(null);
            setShowExtensionModal(false);
            confetti({ particleCount: 70, spread: 60 });
          } catch (vErr: any) {
            alert(vErr.message || 'Extension payment verification failed.');
          } finally {
            setExtending(false);
          }
        },
        modal: {
          ondismiss: () => {
            setExtending(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failResp: any) => {
        alert(failResp.error?.description || 'Extension payment was cancelled or failed.');
        setExtending(false);
      });
      rzp.open();
    } catch (err: any) {
      alert(err.message || 'Failed to initialize session extension payment.');
      setExtending(false);
    }
  };

  // Start Session manually
  const handleStartSession = async () => {
    if (!id) return;
    try {
      const res = await api.startSession(id);
      setSession(res.session);
      setRemainingSeconds(res.session.remainingSeconds || res.session.duration_minutes * 60);
      setCallEndedManually(false);
    } catch (err: any) {
      alert(err.message || 'Failed to start session');
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-2 border-moonstone border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-midnight/60">Connecting to secure live consultation workspace...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <h2 className="text-xl font-bold text-midnight mb-2">Session not found</h2>
        <Link to="/client" className="px-4 py-2 rounded-lg bg-midnight text-aliceblue text-sm font-semibold">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const isSessionActive = session.status === 'ACTIVE' && remainingSeconds > 0;
  const isSessionCompleted = session.status === 'COMPLETED' || session.status === 'EXPIRED' || remainingSeconds <= 0;
  const otherPersonName = user?.id === session.client_id ? session.provider_name : session.client_name;
  const otherPersonAvatar = user?.id === session.client_id ? session.provider_avatar : session.client_avatar;
  const otherPersonRole = user?.id === session.client_id ? 'Expert Provider' : 'Client';
  const backLink = user?.role === 'provider' ? '/provider' : user?.role === 'admin' ? '/admin' : '/client';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      
      {/* ---------------- TOP HEADER (Sticky on Mobile - Section 15) ---------------- */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md rounded-2xl border border-timberwolf/70 p-3 sm:p-5 shadow-subtle flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
        
        {/* Back Link & Participant Identity */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Link
            to={backLink}
            className="p-2 rounded-xl bg-aliceblue text-midnight/70 hover:text-midnight hover:bg-aliceblue-dark transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <img
            src={otherPersonAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherPersonName}`}
            alt={otherPersonName}
            className="w-11 h-11 rounded-xl object-cover border-2 border-lightblue"
          />

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base text-midnight">{otherPersonName}</h2>
              <span className="text-[10px] font-semibold text-moonstone bg-aliceblue px-2 py-0.5 rounded-full border border-timberwolf/40">
                {otherPersonRole}
              </span>
            </div>
            <p className="text-xs text-midnight/70 font-medium truncate max-w-[240px] sm:max-w-md">
              {session.service_title}
            </p>
          </div>
        </div>

        {/* Server Authoritative Timer Display */}
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
          <div className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl border flex items-center gap-2.5 transition-all ${
            isSessionCompleted
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : remainingSeconds <= 300 && remainingSeconds > 0
              ? 'bg-amber-50 border-amber-300 text-amber-800 animate-pulse'
              : 'bg-midnight border-midnight text-aliceblue shadow-subtle'
          }`}>
            <Clock className="w-5 h-5 text-moonstone shrink-0" />
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                {isSessionCompleted ? 'Session Ended' : isSessionActive ? 'Remaining Time' : 'Scheduled Duration'}
              </span>
              <span className="font-mono font-extrabold text-lg sm:text-xl tracking-tight leading-none mt-0.5">
                {isSessionCompleted ? '00:00' : formatTimer(remainingSeconds)}
              </span>
            </div>
          </div>

          {session.status === 'SCHEDULED' && (
            <button
              onClick={handleStartSession}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-moonstone text-white text-xs font-bold hover:bg-moonstone-hover shadow-subtle flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
            >
              <Sparkles className="w-4 h-4" /> Start Session Now
            </button>
          )}

          {isSessionActive && user?.role === 'client' && (
            <button
              onClick={() => setShowExtensionModal(true)}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-subtle flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
            >
              <Clock className="w-4 h-4" /> + Extend Time
            </button>
          )}

          {isSessionActive && (
            <button
              onClick={handleEndSessionExplicit}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold shadow-subtle flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
              title="End session completely and trigger rating"
            >
              <PhoneOff className="w-4 h-4" /> End Session
            </button>
          )}
        </div>

      </div>

      {/* ---------------- MOBILE WORKSPACE SEGMENTED CONTROLS (Section 15) ---------------- */}
      <div className="lg:hidden flex rounded-xl bg-aliceblue p-1 border border-timberwolf/60">
        <button
          type="button"
          onClick={() => setMobileWorkspaceTab('video')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px] active:scale-95 ${
            mobileWorkspaceTab === 'video'
              ? 'bg-midnight text-aliceblue shadow-subtle'
              : 'text-midnight/70 hover:text-midnight'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>Video Stream</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileWorkspaceTab('chat')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px] active:scale-95 ${
            mobileWorkspaceTab === 'chat'
              ? 'bg-midnight text-aliceblue shadow-subtle'
              : 'text-midnight/70 hover:text-midnight'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>Chat & Files {messages.length > 0 && `(${messages.length})`}</span>
        </button>
      </div>

      {/* Warning & Seamless Extension Bar (< 5 mins or warning active) */}
      {isSessionActive && (warningMessage || (remainingSeconds <= 300 && remainingSeconds > 0)) && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-subtle animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-700 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                Consultation Approaching Deadline ({formatTimer(remainingSeconds)} left)
              </h4>
              <p className="text-xs text-amber-900/80 mt-0.5">
                {warningMessage || 'When the timer hits 0:00, video and chat will automatically terminate.'}
              </p>
            </div>
          </div>

          {user?.role === 'client' && (
            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
              <span className="text-[11px] font-bold text-amber-950 mr-1 hidden sm:inline">Add Time:</span>
              {[5, 15, 30].map((mins) => {
                const rate = session.price_per_minute || 1;
                const cost = (mins * rate).toFixed(2);
                return (
                  <button
                    key={mins}
                    type="button"
                    disabled={extending}
                    onClick={() => handleExtendSession(mins)}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-subtle cursor-pointer disabled:opacity-50 transition-all"
                  >
                    +{mins}m ({formatINR(cost)})
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleEndSessionExplicit}
                className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-xs font-bold cursor-pointer transition-all"
              >
                End Session
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- MAIN SESSION WORKSPACE ---------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[580px]">
        
        {/* ---------------- LEFT / MAIN AREA: Video & Media Workspace ---------------- */}
        <div className={`lg:col-span-2 flex-col justify-between bg-midnight rounded-2xl border border-midnight shadow-card overflow-hidden relative p-4 sm:p-6 text-aliceblue min-h-[440px] lg:min-h-[580px] ${
          mobileWorkspaceTab === 'video' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Top Status Bar */}
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2 bg-midnight-light/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-timberwolf/20 text-xs">
              <span className={`w-2 h-2 rounded-full ${isSessionActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="font-medium">
                {isSessionCompleted
                  ? 'Stream Terminated'
                  : isSessionActive
                  ? isPeerConnected
                    ? 'Encrypted P2P Stream Active'
                    : 'Encrypted Stream (Standby)'
                  : 'Session Not Started'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-aliceblue/60 font-mono">
              <Lock className="w-3 h-3 text-moonstone" />
              <span>{session.duration_minutes}m timed room</span>
            </div>
          </div>

          {/* Main Video Viewport */}
          <div className="relative my-auto w-full flex-1 flex items-center justify-center py-4">
            
            {isSessionCompleted ? (
              // Session Completed Terminal State
              <div className="text-center space-y-3 max-w-md animate-fade-in p-6">
                <div className="w-14 h-14 rounded-full bg-midnight-light text-moonstone mx-auto flex items-center justify-center border border-timberwolf/20">
                  <CheckCircle className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-aliceblue">
                  This session has ended.
                </h3>
                <p className="text-xs text-aliceblue/70 leading-relaxed">
                  The scheduled time has expired. All audio, video, and chat communications have been securely terminated.
                </p>
                <div className="pt-2 flex items-center justify-center gap-3">
                  {user?.role === 'client' && (
                    <button
                      onClick={() => setShowReviewModal(true)}
                      className="px-4 py-2 rounded-xl bg-moonstone text-white font-semibold text-xs hover:bg-moonstone-hover cursor-pointer"
                    >
                      Leave a Review
                    </button>
                  )}
                  <Link
                    to={`/services/${session.service_id}`}
                    className="px-4 py-2 rounded-xl bg-aliceblue text-midnight font-semibold text-xs hover:bg-white cursor-pointer"
                  >
                    Book Another Session
                  </Link>
                </div>
              </div>
            ) : isSessionActive && !callEndedManually ? (
              // Active Video / Audio Viewport
              <div className="w-full h-full flex items-center justify-center relative min-h-[300px] sm:min-h-[360px] rounded-xl overflow-hidden bg-midnight-light/50 border border-timberwolf/10">
                
                {/* Remote Video Stream */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover rounded-xl ${remoteHasVideo ? 'block' : 'hidden'}`}
                />

                {/* Remote Participant Avatar (Shown when remote camera is off or audio-only) */}
                {!remoteHasVideo && (
                  <div className="flex flex-col items-center justify-center space-y-3 p-6 text-center animate-fade-in">
                    <div className="relative">
                      <img
                        src={otherPersonAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherPersonName}`}
                        alt={otherPersonName}
                        className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-moonstone shadow-elevated"
                      />
                      <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-midnight flex items-center justify-center text-[10px]">
                        <Mic className="w-3 h-3 text-white" />
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-aliceblue">{otherPersonName}</h4>
                      <p className="text-xs text-aliceblue/60">
                        {isPeerConnected ? 'Voice Connected (Camera Off)' : 'Connecting stream...'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Local Participant Picture-in-Picture Video */}
                <div className="absolute bottom-3 right-3 w-28 h-20 sm:w-36 sm:h-24 rounded-xl overflow-hidden border-2 border-moonstone/60 shadow-elevated bg-midnight z-20">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`w-full h-full object-cover ${videoEnabled && hasMediaAccess ? 'block' : 'hidden'}`}
                  />
                  {(!videoEnabled || !hasMediaAccess) && (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-midnight text-aliceblue/70 text-[10px]">
                      <User className="w-5 h-5 text-moonstone mb-0.5" />
                      <span>You (Camera Off)</span>
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 bg-midnight/80 px-1.5 py-0.5 rounded text-[9px] text-aliceblue/80">
                    You
                  </span>
                </div>

              </div>
            ) : (
              // Standby / Not Started / Ended Manually
              <div className="text-center space-y-3 max-w-sm p-6">
                <div className="w-12 h-12 rounded-full bg-midnight-light text-moonstone mx-auto flex items-center justify-center border border-timberwolf/20">
                  <Radio className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-base text-aliceblue">
                  {callEndedManually ? 'Call Disconnected' : 'Consultation Room Ready'}
                </h4>
                <p className="text-xs text-aliceblue/60">
                  {callEndedManually
                    ? 'You have disconnected from the media stream. You can still use the chat until the timer concludes.'
                    : 'Click "Start Session Now" at the top when you are ready to begin the consultation.'}
                </p>
                {callEndedManually && isSessionActive && (
                  <button
                    onClick={() => setCallEndedManually(false)}
                    className="px-4 py-2 rounded-xl bg-moonstone text-white font-semibold text-xs hover:bg-moonstone-hover cursor-pointer"
                  >
                    Reconnect Stream
                  </button>
                )}
              </div>
            )}

          </div>

          {/* ---------------- BOTTOM MEDIA CONTROLS (Section 15: >=48px Touch Targets) ---------------- */}
          {isSessionActive && !callEndedManually && (
            <div className="flex items-center justify-center gap-2.5 sm:gap-3 z-10 pt-3 border-t border-timberwolf/10 flex-wrap">
              
              {/* Microphone */}
              <button
                type="button"
                onClick={toggleMicrophone}
                className={`min-h-[48px] min-w-[48px] p-3 sm:px-4 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 ${
                  micEnabled
                    ? 'bg-midnight-light border-timberwolf/30 text-aliceblue hover:bg-midnight-hover'
                    : 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                }`}
                title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {micEnabled ? <Mic className="w-4 h-4 text-emerald-400" /> : <MicOff className="w-4 h-4" />}
                <span className="hidden sm:inline">{micEnabled ? 'Mute' : 'Unmuted'}</span>
              </button>

              {/* Camera */}
              <button
                type="button"
                onClick={toggleCamera}
                className={`min-h-[48px] min-w-[48px] p-3 sm:px-4 rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 ${
                  videoEnabled
                    ? 'bg-midnight-light border-timberwolf/30 text-aliceblue hover:bg-midnight-hover'
                    : 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                }`}
                title={videoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
              >
                {videoEnabled ? <Video className="w-4 h-4 text-emerald-400" /> : <VideoOff className="w-4 h-4" />}
                <span className="hidden sm:inline">{videoEnabled ? 'Stop Video' : 'Start Video'}</span>
              </button>

              {/* Screen Share (Hidden on small mobile screens where unsupported) */}
              <button
                type="button"
                onClick={toggleScreenShare}
                className={`min-h-[48px] min-w-[48px] p-3 sm:px-4 rounded-xl border transition-all cursor-pointer items-center justify-center gap-2 text-xs font-semibold active:scale-95 hidden sm:flex ${
                  screenSharing
                    ? 'bg-moonstone border-moonstone text-white shadow-subtle'
                    : 'bg-midnight-light border-timberwolf/30 text-aliceblue hover:bg-midnight-hover'
                }`}
                title="Share Screen"
              >
                <Monitor className="w-4 h-4" />
                <span className="hidden sm:inline">{screenSharing ? 'Sharing' : 'Share Screen'}</span>
              </button>

              {/* End Call */}
              <button
                type="button"
                onClick={handleEndCall}
                className="min-h-[48px] min-w-[48px] p-3 sm:px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white border border-rose-500 shadow-subtle transition-all cursor-pointer flex items-center justify-center gap-2 text-xs font-bold active:scale-95"
                title="Leave Media Stream"
              >
                <PhoneOff className="w-4 h-4" />
                <span className="hidden sm:inline">End Call</span>
              </button>

            </div>
          )}

        </div>

        {/* ---------------- RIGHT: CHAT & FILE SHARING PANEL (Section 15: Segmented on Mobile) ---------------- */}
        <div className={`lg:col-span-1 bg-white rounded-2xl border border-timberwolf/70 shadow-subtle flex-col justify-between overflow-hidden h-[540px] lg:h-[580px] ${
          mobileWorkspaceTab === 'chat' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Chat Header */}
          <div className="p-4 border-b border-timberwolf/40 bg-aliceblue/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-midnight uppercase tracking-wider">
                Live Chat & Files
              </span>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              isSessionActive ? 'bg-emerald-100 text-emerald-800' : 'bg-timberwolf/40 text-midnight/60'
            }`}>
              {isSessionActive ? 'Chat Open' : 'Closed'}
            </span>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs">
            {messages.length === 0 ? (
              <div className="text-center py-16 text-midnight/50 space-y-2">
                <FileText className="w-8 h-8 mx-auto text-timberwolf-dark" />
                <p className="font-medium">No messages yet.</p>
                <p className="text-[11px]">Send notes, code snippets, or attach documents below.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender_id === user?.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <span className="text-[10px] text-midnight/50 font-medium px-1">
                      {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed shadow-subtle ${
                        isMe
                          ? 'bg-midnight text-aliceblue rounded-tr-none'
                          : 'bg-aliceblue text-midnight border border-timberwolf/40 rounded-tl-none'
                      }`}
                    >
                      {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

                      {msg.file_url && (
                        <div className="mt-2 pt-2 border-t border-white/20">
                          <a
                            href={
                              msg.file_url.startsWith('http://') || msg.file_url.startsWith('https://')
                                ? msg.file_url
                                : `${window.location.origin}${msg.file_url.startsWith('/') ? '' : '/'}${msg.file_url}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-2 p-2 rounded-xl text-[11px] font-semibold transition-colors ${
                              isMe ? 'bg-midnight-light text-aliceblue hover:bg-midnight-hover' : 'bg-white text-midnight hover:bg-aliceblue'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5 text-moonstone shrink-0" />
                            <span className="truncate">{msg.file_name || 'Download Attachment'}</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input & File Attachment Bar */}
          <div className="p-3 bg-aliceblue/30 border-t border-timberwolf/40">
            {isSessionActive ? (
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {/* Attach File Button */}
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl bg-white border border-timberwolf/60 text-midnight/70 hover:text-midnight hover:bg-aliceblue transition-all cursor-pointer disabled:opacity-50"
                  title="Attach file (PDF, image, code, zip)"
                >
                  <Paperclip className="w-4 h-4 text-moonstone" />
                </button>

                {/* Message Input */}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Write a message..."
                  className="flex-1 bg-white border border-timberwolf/70 rounded-xl px-3.5 py-2.5 text-xs text-midnight placeholder:text-midnight/40 focus:outline-none focus:border-moonstone"
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="p-2.5 rounded-xl bg-midnight text-aliceblue hover:bg-midnight-hover transition-all cursor-pointer disabled:opacity-40"
                  title="Send Message"
                >
                  <Send className="w-4 h-4 text-moonstone" />
                </button>

              </form>
            ) : (
              <div className="text-center py-2 px-3 bg-timberwolf/20 rounded-xl text-[11px] text-midnight/60 font-medium">
                {isSessionCompleted
                  ? 'This session has ended. Book another session to continue communicating.'
                  : 'Communication will activate once the session starts.'}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ---------------- REVIEW MODAL (Client Only) ---------------- */}
      {showReviewModal && !reviewSubmitted && (
        <div className="fixed inset-0 z-50 bg-midnight/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-timberwolf max-w-md w-full p-6 sm:p-8 space-y-5 shadow-modal text-center animate-scale-up">
            
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 mx-auto flex items-center justify-center border border-amber-200">
              <Star className="w-7 h-7 fill-amber-400" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-midnight">Rate your consultation</h3>
              <p className="text-xs text-midnight/70">
                How was your experience with <strong>{otherPersonName}</strong>?
              </p>
            </div>

            {/* Star selector */}
            <div className="flex items-center justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  className="p-1 cursor-pointer transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= reviewRating
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-timberwolf-dark'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Comment */}
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Share feedback on the expert's advice, clarity, and pacing..."
              rows={3}
              className="w-full p-3 bg-aliceblue/30 border border-timberwolf/70 rounded-xl text-xs text-midnight focus:outline-none focus:border-moonstone"
            />

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight/70 hover:bg-aliceblue cursor-pointer"
              >
                Skip For Now
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                className="flex-1 py-2.5 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover shadow-subtle cursor-pointer"
              >
                Submit Review
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ---------------- SESSION EXTENSION MODAL (Client Only) ---------------- */}
      {showExtensionModal && (
        <div className="fixed inset-0 z-50 bg-midnight/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-timberwolf max-w-md w-full p-6 sm:p-8 space-y-5 shadow-modal text-center animate-scale-up">
            
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center border border-amber-200">
              <Clock className="w-7 h-7 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-midnight">Extend Consultation Session</h3>
              <p className="text-xs text-midnight/70">
                Continue your session with <strong>{otherPersonName}</strong> without interruption.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5 py-2">
              {[5, 15, 30].map((mins) => {
                const rate = session.price_per_minute || 1;
                const cost = (mins * rate).toFixed(2);
                return (
                  <button
                    key={mins}
                    type="button"
                    disabled={extending}
                    onClick={() => handleExtendSession(mins)}
                    className="p-3 rounded-2xl border-2 border-amber-300 bg-amber-50/60 hover:bg-amber-100/80 text-amber-950 transition-all cursor-pointer flex flex-col items-center gap-1 disabled:opacity-50"
                  >
                    <span className="font-extrabold text-base">+{mins} min</span>
                    <span className="text-xs font-mono font-bold text-amber-800">{formatINR(cost)}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-midnight/60">
              Server-authoritative extension. The call will continue seamlessly without re-connection.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowExtensionModal(false)}
                className="w-full py-2.5 rounded-xl border border-timberwolf/70 text-xs font-semibold text-midnight/70 hover:bg-aliceblue cursor-pointer"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
export default SessionPage;
