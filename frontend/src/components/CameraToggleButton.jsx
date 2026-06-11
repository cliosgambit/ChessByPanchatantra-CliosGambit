import React, { useRef, useState, useEffect } from 'react';
import { IconButton } from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';

function CameraToggleButton() {
  const videoRef = useRef(null);
  const [pipActive, setPipActive] = useState(false);
  const streamRef = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      if (document.pictureInPictureEnabled && !document.pictureInPictureElement) {
        await videoRef.current.requestPictureInPicture();
      }

      setPipActive(true);
    } catch (error) {
      console.error("Error accessing webcam:", error);
      alert("Please allow webcam access.");
    }
  };

  const stopCamera = async () => {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setPipActive(false);
  };

  const toggleCamera = () => {
    if (pipActive) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  // Handle keyboard shortcut C/c
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault(); 
        toggleCamera();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pipActive]);

  return (
    <>
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        style={{
          display: 'none', // Hidden in UI
          width: '200px',
          height: '200px',
          borderRadius: '10%', // Circle shape
          objectFit: 'cover', // Fill circle properly
        }}
      />

      <IconButton
        onClick={toggleCamera}
        icon={pipActive ? <ViewOffIcon /> : <ViewIcon />}
        variant="ghost"
        aria-label="Toggle Camera PiP"
        color="gray.600"
        _hover={{ bg: "gray.200" }}
      />
    </>
  );
}

export default CameraToggleButton;

