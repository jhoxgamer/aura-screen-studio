import React, { useEffect } from 'react';
import { PreRecordingView } from './views/PreRecordingView';
import { CameraBubbleView } from './views/CameraBubbleView';
import { ControlBarView } from './views/ControlBarView';
import { DrawingOverlayView } from './views/DrawingOverlayView';
import { CountdownView } from './views/CountdownView';
import { PreviewView } from './views/PreviewView';
import { audioService } from './services/audioService';

export const App: React.FC = () => {
  useEffect(() => {
    const cleanup = audioService.initSoundListeners();
    return cleanup;
  }, []);

  const searchParams = new URLSearchParams(window.location.search);
  const view = searchParams.get('view') || 'pre-recording';

  switch (view) {
    case 'camera-bubble':
      return <CameraBubbleView />;
    case 'control-bar':
      return <ControlBarView />;
    case 'drawing-overlay':
      return <DrawingOverlayView />;
    case 'countdown':
      return <CountdownView />;
    case 'preview':
      return <PreviewView />;
    case 'pre-recording':
    default:
      return <PreRecordingView />;
  }
};
