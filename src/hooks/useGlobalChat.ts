
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Message, UserProfile } from '../types';

// Define RealtimeChannel type from supabase instance
type RealtimeChannel = ReturnType<typeof supabase.channel>;

const GLOBAL_CHAT_CHANNEL = 'global-chat-room';
const MAX_GLOBAL_MESSAGES = 50;
const STORAGE_KEY = 'global_chat_history';

export const useGlobalChat = (userProfile: UserProfile | null, myPeerId: string | null) => {
  const [globalMessages, setGlobalMessages] = useState<Message[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setGlobalMessages(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load global chat history", e);
    }
  }, []);

  // Save to local storage whenever messages change
  useEffect(() => {
    if (globalMessages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(globalMessages));
      } catch (e) {
        console.warn("Global chat storage limit reached", e);
      }
    }
  }, [globalMessages]);

  useEffect(() => {
    if (!userProfile) return;

    const channel = supabase.channel(GLOBAL_CHAT_CHANNEL);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        setGlobalMessages((prev) => {
          const updated = [...prev, payload];
          // FIFO Limit
          if (updated.length > MAX_GLOBAL_MESSAGES) {
             return updated.slice(updated.length - MAX_GLOBAL_MESSAGES);
          }
          return updated;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile]);

  const sendGlobalMessage = useCallback(async (text: string) => {
    if (!channelRef.current || !userProfile) return;

    const newMessage: Message = {
      id: Date.now().toString() + Math.random().toString(),
      text,
      sender: 'stranger',
      senderName: userProfile.username, 
      senderPeerId: myPeerId || undefined, // Include my peer ID so others can add/message me
      senderProfile: userProfile, // Include full profile
      timestamp: Date.now(),
      type: 'text'
    };

    // Broadcast to others
    await channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload: newMessage
    });

    // Add to local state (sender: 'me')
    setGlobalMessages((prev) => {
      const updated = [...prev, { ...newMessage, sender: 'me' as const }];
      if (updated.length > MAX_GLOBAL_MESSAGES) {
         return updated.slice(updated.length - MAX_GLOBAL_MESSAGES);
      }
      return updated;
    });
  }, [userProfile, myPeerId]);

  return {
    globalMessages,
    sendGlobalMessage
  };
};
