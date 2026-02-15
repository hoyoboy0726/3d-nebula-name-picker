
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float, PerspectiveCamera } from '@react-three/drei';
import { Settings, Play, Volume2, VolumeX } from 'lucide-react';
import confetti from 'canvas-confetti';
import { GoogleGenAI } from "@google/genai";
import * as THREE from 'three';
import NameCloud from './components/NameCloud';
import InputModal from './components/InputModal';
import WinnerModal from './components/WinnerModal';
import ApiKeyInput from './components/ApiKeyInput';

const DEFAULT_NAMES = [
  "Ann_Chen", "張幸福", "John_Doe", "李小龍", "Sarah_Wang", "王大明", 
  "Peter_Pan", "林美玲", "Emma_Watson", "陳阿土", "Jason_Momoa", "劉德華",
  "Sophia_Lee", "張學友", "Chris_Evans", "周杰倫", "Taylor_Swift", "蔡依林",
  "Robert_Downey", "林志玲", "Keanu_Reeves", "郭富城", "Scarlett_J", "梁朝偉",
  "Tom_Cruise", "楊紫瓊", "David_Beckham", "周星馳", "Lady_Gaga", "鄧紫棋",
  "Elon_Musk", "金城武", "Bill_Gates", "王祖賢", "Steve_Jobs", "舒淇",
  "Mark_Zuckerberg", "彭于晏", "Jeff_Bezos", "五月天"
];

// Helper to decode Base64 string to Uint8Array
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to convert raw PCM (Int16) to AudioBuffer (Float32)
async function pcmToAudioBuffer(
  data: Uint8Array, 
  ctx: AudioContext, 
  sampleRate: number = 24000
): Promise<AudioBuffer> {
  // Ensure the data is aligned to 2 bytes (16-bit)
  if (data.length % 2 !== 0) {
    data = data.slice(0, data.length - 1);
  }

  // Create a copy of the buffer to ensure byteOffset alignment
  const alignedBuffer = new Uint8Array(data.length);
  alignedBuffer.set(data);

  const dataInt16 = new Int16Array(alignedBuffer.buffer);
  const frameCount = dataInt16.length;
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    // Convert Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
    channelData[i] = dataInt16[i] / 32768.0;
  }
  
  return buffer;
}

// Hook to create a reusable circular texture
function useCircleTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create a radial gradient (glowing center)
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 32, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }, []);
}

// --------------------------------------------------------
// Component: ColorfulStarField (Static Background)
// --------------------------------------------------------
const ColorfulStarField = ({ count = 3000, radius = 300 }) => {
  const mesh = useRef<THREE.Points>(null);
  const texture = useCircleTexture();

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    
    // Updated Vivid Star Palette with more Red, Yellow, Green
    const palette = [
      '#ff3333', // Bright Red
      '#ff5733', // Orange Red
      '#ff8800', // Deep Orange
      '#ffcc00', // Golden Yellow
      '#ffff00', // Bright Yellow
      '#ccff00', // Lime
      '#33ff33', // Bright Green
      '#00ff99', // Cyan Green
      '#00ffff', // Cyan
      '#3399ff', // Sky Blue
      '#9933ff', // Purple
      '#ff33cc', // Hot Pink
      '#ffffff', // White
    ];

    for (let i = 0; i < count; i++) {
      // Spherical distribution
      const r = radius * Math.cbrt(Math.random()); // Even distribution in sphere
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Pick random vivid color
      const hex = palette[Math.floor(Math.random() * palette.length)];
      color.set(hex);
      
      // Add slight random variation to brightness
      const brightness = 0.8 + Math.random() * 0.4;
      colors[i * 3] = color.r * brightness;
      colors[i * 3 + 1] = color.g * brightness;
      colors[i * 3 + 2] = color.b * brightness;
    }
    return { positions, colors };
  }, [count, radius]);

  useFrame((state, delta) => {
    if (mesh.current) {
      // Slow background rotation
      mesh.current.rotation.y -= delta * 0.02; 
      mesh.current.rotation.x += delta * 0.005;
    }
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={1.5} // Increased size because round texture cuts off corners
        map={texture} // Apply round texture
        vertexColors
        transparent
        opacity={0.9}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        alphaTest={0.01}
      />
    </points>
  );
};

// --------------------------------------------------------
// Component: WarpStars (Simulates flying through space)
// --------------------------------------------------------
const WarpStars = ({ count = 1000, speed = 2 }) => {
  const mesh = useRef<THREE.Points>(null);
  const texture = useCircleTexture();
  
  // Generate random positions AND colors
  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const cols = new Float32Array(count * 3);
    const color = new THREE.Color();
    
    // Softer palette for warp stars (mostly white/cyan/blue for speed feel)
    const warpPalette = ['#ffffff', '#a5f3fc', '#c084fc', '#9bb0ff'];

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 200; // x
      pos[i * 3 + 1] = (Math.random() - 0.5) * 200; // y
      pos[i * 3 + 2] = (Math.random() - 0.5) * 400; // z
      
      const hex = warpPalette[Math.floor(Math.random() * warpPalette.length)];
      color.set(hex);
      cols[i * 3] = color.r;
      cols[i * 3 + 1] = color.g;
      cols[i * 3 + 2] = color.b;
    }
    return { positions: pos, colors: cols };
  }, [count]);

  useFrame((state, delta) => {
    if (!mesh.current) return;
    
    // Determine speed based on interaction or default flight
    const moveSpeed = speed + Math.sin(state.clock.elapsedTime) * 0.5;

    const positions = mesh.current.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < count; i++) {
      // Move star towards camera (increase Z)
      positions[i * 3 + 2] += moveSpeed;

      // If star passes the camera (Z > 50), reset it to far background (Z = -300)
      if (positions[i * 3 + 2] > 50) {
        positions[i * 3 + 2] = -300;
        // Randomize X and Y again for variety
        positions[i * 3] = (Math.random() - 0.5) * 200;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
      }
    }
    
    mesh.current.geometry.attributes.position.needsUpdate = true;
    mesh.current.rotation.z += delta * 0.05;
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.8} // Increased size slightly
        map={texture} // Apply round texture
        vertexColors 
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        alphaTest={0.01}
      />
    </points>
  );
};

const App: React.FC = () => {
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showInputModal, setShowInputModal] = useState(false);
  
  const [winners, setWinners] = useState<string[] | null>(null);
  const [winnerCount, setWinnerCount] = useState<number>(1);
  const [userApiKey, setUserApiKey] = useState<string>('');

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [useRandomColors, setUseRandomColors] = useState(false); 
  const [rotationSpeed, setRotationSpeed] = useState(2); 
  
  const drawTimeoutRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextTickTimeRef = useRef<number>(0);
  
  // Ref to store the pre-fetched AI speech audio buffer
  const aiSpeechBufferRef = useRef<AudioBuffer | null>(null);

  // Initialize Audio Context on first interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    };
    window.addEventListener('click', initAudio, { once: true });
    return () => window.removeEventListener('click', initAudio);
  }, []);

  const playTick = useCallback(() => {
    if (!soundEnabled || !audioCtxRef.current) return;
    try {
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      console.error("Audio error", e);
    }
  }, [soundEnabled]);

  // Generate High-Quality AI Speech using Gemini 2.0 Flash (Experimental Audio Support)
  const generateAIAnnouncement = useCallback(async (winnerNames: string[]) => {
    if (!userApiKey || !audioCtxRef.current) {
      console.warn("Skipping AI generation: Missing User API Key or Audio Context");
      return;
    }

    try {
      // Explicitly use v1beta for early access multimodal features like AUDIO
      const ai = new GoogleGenAI({ 
        apiKey: userApiKey,
      });
      
      const pronounceableNames = winnerNames.map(n => n.replace(/_/g, ' '));
      const textToSay = `Say cheerfully in Traditional Chinese: 恭喜！得獎者是 ${pronounceableNames.join(', ')}！`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts: [{ text: textToSay }] }],
        config: {
          response_modalities: ["AUDIO"],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: { voice_name: 'Puck' },
            },
          },
        } as any,
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      const base64Audio = audioPart?.inlineData?.data;
      
      if (base64Audio && audioCtxRef.current) {
         const audioBytes = decodeBase64(base64Audio);
         const buffer = await pcmToAudioBuffer(audioBytes, audioCtxRef.current, 24000);
         aiSpeechBufferRef.current = buffer;
         console.log("✅ AI Speech generated successfully using Gemini 2.0 Flash Exp (Audio)");
      } else {
         console.warn("⚠️ No audio data received in Gemini response. Possible reasons: Model limitation or quota.");
         aiSpeechBufferRef.current = null;
      }
    } catch (error: any) {
      console.error("❌ Gemini API Call failed:", error);
      aiSpeechBufferRef.current = null;
    }
  }, [userApiKey]);

  // Browser TTS Fallback
  const speakWinnerFallback = useCallback((winnerNames: string[]) => {
    if (!soundEnabled || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const pronounceableNames = winnerNames.map(n => n.replace(/_/g, ' '));
    const text = `恭喜！！得獎者是！${pronounceableNames.join('，還有，')}！`;
    const utterance = new SpeechSynthesisUtterance(text);
    
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => (v.lang.includes('zh-TW') || v.lang.includes('zh-CN')) && v.name.includes('Google')) 
                 || voices.find(v => v.lang.includes('zh-TW') || v.lang.includes('zh-CN'));
    
    if (zhVoice) utterance.voice = zhVoice;
    
    utterance.rate = 1.2; 
    utterance.pitch = 1.4; 
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  }, [soundEnabled]);

  const playWinSoundAndSpeech = useCallback((winnerNames: string[]) => {
    if (!soundEnabled || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;

    // 1. Play Fanfare Music
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const playTone = (freq: number, startTime: number, duration: number, type: OscillatorType = 'triangle', vol: number = 0.2) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Fanfare
      playTone(523.25, t + 0.0, 0.3, 'sawtooth', 0.2); // C4
      playTone(523.25, t + 0.0, 0.3, 'sine', 0.2);
      playTone(659.25, t + 0.15, 0.3, 'sawtooth', 0.2); // E4
      playTone(783.99, t + 0.30, 0.3, 'sawtooth', 0.2); // G4
      
      const impactTime = t + 0.45;
      const duration = 2.5;
      playTone(523.25, impactTime, duration, 'triangle', 0.3); // C4
      playTone(1046.50, impactTime, duration, 'sawtooth', 0.2); // C5
      playTone(1318.51, impactTime, duration, 'sine', 0.1); // E5
      
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'sine';
      bassOsc.frequency.setValueAtTime(130.81, impactTime);
      bassOsc.frequency.exponentialRampToValueAtTime(65.41, impactTime + 1.0);
      bassGain.gain.setValueAtTime(0.4, impactTime);
      bassGain.gain.exponentialRampToValueAtTime(0.001, impactTime + 2.0);
      bassOsc.connect(bassGain);
      bassGain.connect(ctx.destination);
      bassOsc.start(impactTime);
      bassOsc.stop(impactTime + 2.0);
    } catch (e) {
      console.error("Audio error", e);
    }

    // 2. Play Speech (AI Buffer or Browser Fallback)
    setTimeout(() => {
        if (aiSpeechBufferRef.current) {
            try {
                const source = ctx.createBufferSource();
                source.buffer = aiSpeechBufferRef.current;
                source.connect(ctx.destination);
                source.start();
                console.log("🔊 Playing AI Speech");
            } catch (e) {
                console.error("Failed to play AI buffer", e);
                speakWinnerFallback(winnerNames);
            }
        } else {
            console.warn("⚠️ Using Fallback TTS (AI buffer missing or generation failed)");
            speakWinnerFallback(winnerNames);
        }
    }, 600); 
  }, [soundEnabled, speakWinnerFallback]);

  const handleStartDraw = useCallback(() => {
    if (names.length === 0 || isDrawing) return;
    
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    setIsDrawing(true);
    setWinners(null);
    aiSpeechBufferRef.current = null; // Reset audio buffer
    nextTickTimeRef.current = 0; 
    
    // --- 1. DETERMINE WINNERS IMMEDIATELY ---
    const shuffled = [...names].sort(() => 0.5 - Math.random());
    const count = Math.min(winnerCount, names.length);
    const selectedWinners = shuffled.slice(0, count);

    // --- 2. START GENERATING AI SPEECH IN BACKGROUND ---
    // The animation runs for 8 seconds.
    generateAIAnnouncement(selectedWinners);
    
    const duration = 8000; 
    const startTime = Date.now();

    const updateSpeed = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = elapsed / duration;

      if (progress >= 1) {
        // --- 3. REVEAL WINNERS ---
        setWinners(selectedWinners);
        setIsDrawing(false);
        setRotationSpeed(2); 
        
        playWinSoundAndSpeech(selectedWinners);
        
        confetti({
          particleCount: 200 * count,
          spread: 100,
          origin: { y: 0.5 },
          colors: ['#3b82f6', '#8b5cf6', '#ec4899', '#facc15', '#ffffff'],
        });
        return; 
      }

      // Physics Curve
      let currentSpeed = 2;
      const maxSpeed = 35;

      if (progress < 0.2) {
        const easeIn = progress / 0.2;
        currentSpeed = 2 + easeIn * maxSpeed;
      } else if (progress < 0.8) {
        currentSpeed = maxSpeed + Math.sin(now / 50) * 3; 
      } else {
        const easeOut = (progress - 0.8) / 0.2; 
        currentSpeed = maxSpeed * (1 - Math.pow(easeOut, 3)) + 2;
      }

      // Tick Sound
      const minInterval = 40;
      const maxInterval = 500;
      const speedFactor = Math.min(1, (currentSpeed - 2) / (maxSpeed - 2));
      const interval = maxInterval - (speedFactor * (maxInterval - minInterval));

      if (now > nextTickTimeRef.current) {
        playTick();
        nextTickTimeRef.current = now + interval;
      }

      setRotationSpeed(currentSpeed);
      drawTimeoutRef.current = requestAnimationFrame(updateSpeed);
    };

    drawTimeoutRef.current = requestAnimationFrame(updateSpeed);
  }, [names, isDrawing, winnerCount, playTick, playWinSoundAndSpeech, generateAIAnnouncement]);

  useEffect(() => {
    return () => {
      if (drawTimeoutRef.current) cancelAnimationFrame(drawTimeoutRef.current);
    };
  }, []);

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
    if (!soundEnabled) {
        window.speechSynthesis.cancel();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#050508] text-white selection:bg-purple-500/30 overflow-hidden font-sans">
      {/* 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Canvas dpr={[1, 2]}>
          <PerspectiveCamera makeDefault position={[0, 0, 34]} fov={40} />
          {/* Enhanced Lights for better color visibility */}
          <ambientLight intensity={1.5} />
          <pointLight position={[20, 20, 20]} intensity={2.5} color="#818cf8" />
          <pointLight position={[-20, -10, -10]} intensity={1.5} color="#c084fc" />
          
          {/* Enhanced Colorful Background Stars */}
          <ColorfulStarField count={4000} radius={250} />
          
          {/* Flight Effect with colors */}
          <WarpStars count={1200} speed={isDrawing ? 4 : 1} />

          <OrbitControls 
            enableZoom={true} 
            enablePan={false} 
            enableRotate={true}
            rotateSpeed={0.5}
            minDistance={10}
            maxDistance={80}
          />

          <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
            <NameCloud 
              names={names} 
              rotationSpeed={rotationSpeed} 
              isDrawing={isDrawing}
              winners={winners}
              useRandomColors={useRandomColors}
            />
          </Float>
        </Canvas>
      </div>

      {/* Header UI */}
      <div className={`absolute top-10 left-0 right-0 z-10 flex flex-col items-center pointer-events-none px-4 transition-all duration-700 ${isDrawing ? 'opacity-0 -translate-y-10 blur-sm' : 'opacity-100 translate-y-0'}`}>
        <h1 className="text-4xl md:text-6xl font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 drop-shadow-[0_0_20px_rgba(59,130,246,0.6)] text-center">
          LUCKY SPHERE
        </h1>
        <div className="text-blue-300/50 text-sm tracking-widest mt-2 uppercase">3D Lottery System</div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-16 left-0 right-0 z-20 flex justify-center px-4">
        <div className={`
          relative bg-zinc-900/40 backdrop-blur-xl border border-white/10 rounded-full 
          flex items-center shadow-[0_0_50px_rgba(0,0,0,0.6)] transition-all duration-700 ease-in-out
          ${isDrawing ? 'px-2 py-2 gap-0' : 'px-10 py-5 gap-10'}
        `}>
          
          {/* Settings Button */}
          <div className={`transition-all duration-500 overflow-hidden ${isDrawing ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
            <button 
              onClick={() => setShowInputModal(true)}
              className="flex flex-col items-center gap-1 group whitespace-nowrap"
            >
              <div className="p-3 rounded-full bg-white/5 group-hover:bg-blue-500/20 transition-colors border border-white/5">
                <Settings className="w-6 h-6 text-gray-300 group-hover:text-blue-300" />
              </div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold group-hover:text-white">設定</span>
            </button>
          </div>

          {/* Start Button */}
          <button 
            onClick={handleStartDraw}
            disabled={isDrawing || names.length === 0}
            className={`
              relative flex items-center justify-center rounded-full transition-all duration-500
              ${isDrawing 
                ? 'w-20 h-20 bg-gradient-to-br from-rose-500 to-orange-600 shadow-[0_0_40px_rgba(244,63,94,0.5)]' 
                : 'w-24 h-24 bg-gradient-to-br from-indigo-500 to-blue-600 hover:scale-110 shadow-[0_0_40px_rgba(99,102,241,0.5)] active:scale-95'}
              disabled:opacity-100 disabled:cursor-default
            `}
          >
            {isDrawing ? (
              <div className="flex flex-col items-center animate-pulse">
                <span className="text-2xl font-black">{Math.ceil(8 - ((Date.now() % 10000)/1000))}s</span>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Play className="w-10 h-10 fill-current ml-1" />
                <span className="text-[10px] font-black tracking-widest mt-1">START</span>
              </div>
            )}
            
            {isDrawing && (
              <div className="absolute inset-[-4px] border-2 border-transparent border-t-white/50 rounded-full animate-spin" />
            )}
          </button>

          {/* Sound Button */}
          <div className={`transition-all duration-500 overflow-hidden ${isDrawing ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
            <button 
              onClick={toggleSound}
              className="flex flex-col items-center gap-1 group whitespace-nowrap"
            >
              <div className="p-3 rounded-full bg-white/5 group-hover:bg-purple-500/20 transition-colors border border-white/5">
                {soundEnabled ? <Volume2 className="w-6 h-6 text-gray-300 group-hover:text-purple-300" /> : <VolumeX className="w-6 h-6 text-gray-300" />}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold group-hover:text-white">
                音效
              </span>
            </button>
          </div>
        </div>
      </div>

      {showInputModal && (
        <InputModal 
          names={names} 
          winnerCount={winnerCount}
          useRandomColors={useRandomColors}
          onToggleRandomColors={setUseRandomColors}
          onSave={(newNames, newCount) => {
            setNames(newNames);
            setWinnerCount(newCount);
            setShowInputModal(false);
          }}
          onClose={() => setShowInputModal(false)}
        />
      )}

      {winners && !isDrawing && (
        <WinnerModal 
          winners={winners} 
          onClose={() => {
            setWinners(null);
            if (aiSpeechBufferRef.current) {
                // If using audio buffer, we don't need to cancel speech synthesis, 
                // but if using fallback, we should.
                window.speechSynthesis.cancel();
            }
          }} 
        />
      )}

      {/* Top Right UI (API Key & Stats) */}
      <div className={`absolute top-8 right-8 z-30 flex flex-col items-end gap-3 transition-opacity duration-700 ${isDrawing ? 'opacity-0' : 'opacity-100'}`}>
        <ApiKeyInput onApiKeyChange={setUserApiKey} />
        
        <div className="bg-zinc-900/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-xs text-gray-300 shadow-xl pointer-events-none flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          參與人數: <span className="text-blue-400 font-black text-sm">{names.length}</span>
          <span className="text-gray-500 mx-1">|</span>
          抽出: <span className="text-purple-400 font-black text-sm">{winnerCount}</span>
        </div>
      </div>
    </div>
  );
};

export default App;
