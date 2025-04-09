import { io } from 'socket.io-client';
import { ref } from 'vue';

class SocketService {
  socket = io(import.meta.env.VITE_API_URL);
  isConnected = ref(false);
  
  constructor() {
    this.init();
  }
  
  init() {
    this.socket.on('connect', () => {
      console.log('Connected to socket server');
      this.isConnected.value = true;
    });
    
    this.socket.on('welcome', (data) => {
      console.log('Welcome message:', data);
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from socket server');
      this.isConnected.value = false;
    });
    
    this.socket.on('test', (data) => {
      console.log('Test message received:', data);
    });
  }
  
  ping() {
    console.log('Sending ping to server');
    this.socket.emit('ping', { message: 'Client ping!', timestamp: Date.now() });
  }
  
  onPong(callback: (data: any) => void) {
    this.socket.on('pong', callback);
    return () => this.socket.off('pong', callback);
  }
  
  // Video odalarına katılma
  joinVideoRoom(videoId: string) {
    console.log(`Joining room for video: ${videoId}`);
    this.socket.emit('join_video_room', videoId);
  }
  
  // Video odalarından ayrılma
  leaveVideoRoom(videoId: string) {
    console.log(`Leaving room for video: ${videoId}`);
    this.socket.emit('leave_video_room', videoId);
  }
  
  // Tüm odalardan ayrılma - sonsuz döngüleri önlemek için
  leaveAllRooms() {
    console.log('🧹 Leaving all rooms to prevent duplicate listeners');
    this.socket.emit('leave_all_rooms');
  }
  
  // Odaya katılma onayını dinleme
  onJoinedRoom(callback: (data: any) => void) {
    this.socket.on('joined_room', callback);
    return () => this.socket.off('joined_room', callback);
  }
  
  // Video güncellemelerini dinleme
  onVideoUpdate(callback: (data: any) => void) {
    this.socket.on('video_update', callback);
    return () => this.socket.off('video_update', callback);
  }
  
  // Transkript durum güncellemelerini dinleme
  onTranscriptStatusUpdated(callback: (data: any) => void) {
    console.log('Setting up transcript status listener');
    this.socket.on('transcript_status_updated', (data) => {
      console.log('📡 Socket - Received transcript update:', data);
      callback(data);
    });
    return () => this.socket.off('transcript_status_updated', callback);
  }
  
  // Özet durum güncellemelerini dinleme
  onSummaryStatusUpdated(callback: (data: any) => void) {
    console.log('Setting up summary status listener');
    this.socket.on('summary_status_updated', (data) => {
      console.log('📡 Socket - Received summary update:', data);
      callback(data);
    });
    return () => this.socket.off('summary_status_updated', callback);
  }
}

export default new SocketService(); 