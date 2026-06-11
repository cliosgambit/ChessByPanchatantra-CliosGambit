import React, { useState, useRef, useEffect, useCallback } from 'react'; // Import useCallback
import { Button } from '@chakra-ui/react';
import Confetti from 'react-confetti';
import useWindowSize from '../hooks/useWindowSize';

const CELEBRATION_SOUND_SRC = '/sounds/celebration.mp3'; // <-- CHANGE THIS to your sound file

function CelebrationButton() {
  const [isCelebrating, setIsCelebrating] = useState(false);
  const audioRef = useRef(null);
  const { width, height } = useWindowSize();

  // Initialize Audio object using ref
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(CELEBRATION_SOUND_SRC);
      audioRef.current.preload = 'auto';
    }
  }, []);

  // --- Core Celebration Logic (wrapped in useCallback) ---
  const triggerCelebration = useCallback(() => {
    if (isCelebrating || !audioRef.current) return; // Prevent multiple simultaneous celebrations

    console.log("Triggering celebration!"); // Add log for debugging
    setIsCelebrating(true);

    // Play sound
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(e => console.error("Error playing audio:", e));

    // Stop celebration after a delay
    const timeoutId = setTimeout(() => {
      setIsCelebrating(false);
    }, 7000); // Adjust duration as needed

    // Optional: Clear timeout if component unmounts during celebration
    // (Though less critical here as it just sets state)
    // return () => clearTimeout(timeoutId);

  }, [isCelebrating]); // Dependency: isCelebrating state


  // --- Effect to listen for Spacebar ---
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check if Spacebar was pressed AND not currently celebrating
      if (event.code === 'Space' && !isCelebrating) {

        // IMPORTANT: Prevent triggering if user is focused on an input, textarea, etc.
        const targetTagName = event.target.tagName.toLowerCase();
        if (targetTagName === 'input' || targetTagName === 'textarea' || event.target.isContentEditable) {
          console.log("Space pressed in input/textarea, ignoring celebration trigger.");
          return; // Don't trigger celebration while typing
        }

        // Prevent the default spacebar action (like scrolling the page)
        event.preventDefault();

        // Call the celebration function
        triggerCelebration();
      }
    };

    // Add event listener when component mounts
    window.addEventListener('keydown', handleKeyDown);
    console.log("Keydown listener added."); // Log for debugging

    // Cleanup: Remove event listener when component unmounts
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      console.log("Keydown listener removed."); // Log for debugging
    };
  }, [isCelebrating, triggerCelebration]); // Dependencies: re-run if isCelebrating or triggerCelebration changes


  // --- Button Click Handler (now just calls triggerCelebration) ---
  const handleButtonClick = () => {
      triggerCelebration();
  };

  return (
    <>
      {/* Conditionally render Confetti when celebrating */}
      {isCelebrating && width && height && (
        <Confetti
          width={width}
          height={height}
          recycle={false}
          numberOfPieces={300}
          gravity={0.15}
          initialVelocityY={15}
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 1000 }}
          onConfettiComplete={confettiInstance => {
            console.log('Confetti complete!');
          }}
        />
      )}

      {/* The Button */}
      <Button
        onClick={handleButtonClick} // Use the simple click handler
        // colorScheme="purple"
        isLoading={isCelebrating}
        // loadingText=""
        variant="solid"
        aria-label="Celebrate (or press Spacebar)" // Update aria-label
      >
        🎉 Celebrate! 🎉
      </Button>
    </>
  );
}

export default CelebrationButton;