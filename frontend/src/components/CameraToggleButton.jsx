import React, { useCallback, useEffect, useRef, useState } from 'react';
import './CameraToggleButton.css';

const DEFAULT_POSITION = { x: 16, y: 96 };
const CAMERA_WIDTH = 240;
const CAMERA_HEIGHT = 180;

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

function CameraToggleButton() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const activeRef = useRef(false);
  const dragStateRef = useRef(null);

  const [active, setActive] = useState(false);
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopTracks();
    activeRef.current = false;
    setActive(false);
    setError('');
  }, [stopTracks]);

  const startCamera = useCallback(() => {
    setError('');
    setPosition(DEFAULT_POSITION);
    activeRef.current = true;
    setActive(true);
  }, []);

  const toggleCamera = useCallback(() => {
    if (activeRef.current) {
      stopCamera();
    } else {
      startCamera();
    }
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;

    const openStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });

        if (cancelled || !activeRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error('Error accessing webcam:', err);
        if (!cancelled) {
          activeRef.current = false;
          setActive(false);
          setError('Please allow webcam access.');
        }
      }
    };

    openStream();

    return () => {
      cancelled = true;
      stopTracks();
    };
  }, [active, stopTracks]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'c') return;
      if (isEditableTarget(event.target)) return;

      event.preventDefault();
      toggleCamera();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCamera]);

  const clampPosition = useCallback((x, y) => {
    const maxX = Math.max(8, window.innerWidth - CAMERA_WIDTH - 8);
    const maxY = Math.max(8, window.innerHeight - CAMERA_HEIGHT - 8);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    };
  }, []);

  const onDragPointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDragPointerMove = (event) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setPosition(
      clampPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY)
    );
  };

  const endDrag = (event) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <>
      {error ? (
        <div className="floating-camera-error" role="alert">
          {error}
          <button type="button" onClick={() => setError('')} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      {active ? (
        <div
          className={`floating-camera${dragging ? ' floating-camera--dragging' : ''}`}
          style={{
            left: position.x,
            top: position.y,
            width: CAMERA_WIDTH,
            height: CAMERA_HEIGHT,
          }}
          role="dialog"
          aria-label="Webcam preview"
        >
          <div
            className="floating-camera__bar"
            onPointerDown={onDragPointerDown}
            onPointerMove={onDragPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <button
              type="button"
              className="floating-camera__close"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={stopCamera}
              aria-label="Close camera"
            >
              ×
            </button>
          </div>
          <video
            ref={videoRef}
            className="floating-camera__video"
            muted
            autoPlay
            playsInline
          />
        </div>
      ) : null}
    </>
  );
}

export default CameraToggleButton;
