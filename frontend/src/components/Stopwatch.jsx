import React, { useState, useRef, useEffect } from 'react';
import { Box } from '@chakra-ui/react';
import Draggable from './Draggable';

const MAX_SECONDS = 60;
const RADIUS = 40; // smaller
const STROKE = 5; // 30% less thickness
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function Stopwatch() {
  const [seconds, setSeconds] = useState(MAX_SECONDS);
  const [milliseconds, setMilliseconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (running && (seconds > 0 || milliseconds > 0)) {
      intervalRef.current = setInterval(() => {
        setMilliseconds((prevMs) => {
          if (prevMs > 0) {
            return prevMs - 10;
          } else if (seconds > 0) {
            setSeconds((prev) => prev - 1);
            return 990;
          } else {
            setRunning(false);
            return 0;
          }
        });
      }, 10); // 10ms intervals for milliseconds
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, seconds, milliseconds]);

  // Progress for SVG
  const totalMs = seconds * 1000 + milliseconds;
  const maxMs = MAX_SECONDS * 1000;
  const progress = (totalMs / maxMs) * CIRCUMFERENCE;
  const arcColor = running ? '#ED8936' : '#38B2AC'; // orange when running, green when paused

  // Click handler: if running, reset and pause; if paused, start
  const handleClick = () => {
    if (running) {
      setRunning(false);
      setSeconds(MAX_SECONDS);
      setMilliseconds(0);
    } else {
      if (seconds === 0 && milliseconds === 0) {
        setSeconds(MAX_SECONDS);
        setMilliseconds(0);
      }
      setRunning(true);
    }
  };

  return (
    <Draggable className="stopwatch-draggable">
      <Box
        bg="rgba(255,255,255,0.85)"
        borderRadius="full"
        boxShadow="0 8px 32px 0 rgba(31, 38, 135, 0.18)"
        p={1}
        style={{
          backdropFilter: 'blur(8px)',
          border: '1.5px solid rgba(0,0,0,0.08)',
          minWidth: 110,
          minHeight: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box position="relative" width={2 * (RADIUS + STROKE)} height={2 * (RADIUS + STROKE)}>
          <svg
            width={2 * (RADIUS + STROKE)}
            height={2 * (RADIUS + STROKE)}
            style={{ display: 'block', transform: 'rotate(-90deg)' }} // Start at 90deg
          >
            <circle
              cx={RADIUS + STROKE}
              cy={RADIUS + STROKE}
              r={RADIUS}
              fill="none"
              stroke="#888"
              strokeWidth={STROKE}
              opacity={0.3}
            />
            <circle
              cx={RADIUS + STROKE}
              cy={RADIUS + STROKE}
              r={RADIUS}
              fill="none"
              stroke={arcColor}
              strokeWidth={STROKE}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE - progress}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.2s' }}
            />
          </svg>
          {/* Time in center, clickable to reset/play */}
          <Box
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            fontSize="1.3rem"
            fontWeight="bold"
            color="#2D3748"
            textAlign="center"
            width="100%"
            cursor="pointer"
            onClick={handleClick}
            _hover={{ opacity: 0.7 }}
            title={running ? 'Click to reset & pause' : 'Click to start'}
            userSelect="none"
          >
            <Box>
              {Math.floor(seconds / 60).toString()}:{(seconds % 60).toString().padStart(2, '0')}
              <Box as="span" fontSize="0.5rem" fontWeight="normal" opacity={0.7}>
                .{Math.floor(milliseconds / 10).toString().padStart(2, '0')}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Draggable>
  );
}

export default Stopwatch; 