import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  link?: string;
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  activeNotification: SocketNotification | null;
  dismissNotification: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [activeNotification, setActiveNotification] = useState<SocketNotification | null>(null);

  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? window.location.origin : 'http://localhost:5000');
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      setConnected(true);
      if (user?.id) {
        newSocket.emit('join_user', user.id);
      }
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    // Real-time booking request arrived for provider
    newSocket.on('new_booking_request', (data) => {
      setActiveNotification({
        id: `notif-${Date.now()}`,
        title: 'New Session Request Received',
        message: `${data.clientName} booked a ${data.duration}-minute session for $${Number(data.totalPrice).toFixed(2)}.`,
        type: 'info',
        link: '/provider'
      });
    });

    // Real-time booking accepted for client
    newSocket.on('booking_accepted', (data) => {
      setActiveNotification({
        id: `notif-${Date.now()}`,
        title: 'Session Accepted!',
        message: `${data.providerName} accepted your request. You can now join the session room.`,
        type: 'success',
        link: `/session/${data.sessionId}`
      });
    });

    // Real-time booking rejected for client
    newSocket.on('booking_rejected', (data) => {
      setActiveNotification({
        id: `notif-${Date.now()}`,
        title: 'Request Declined',
        message: `${data.providerName} was unable to accept. Your payment has been refunded.`,
        type: 'warning',
        link: '/client'
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // When user changes, join their specific user room
  useEffect(() => {
    if (socket && user?.id) {
      socket.emit('join_user', user.id);
    }
  }, [socket, user?.id]);

  const dismissNotification = () => {
    setActiveNotification(null);
  };

  return (
    <SocketContext.Provider value={{ socket, connected, activeNotification, dismissNotification }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};
