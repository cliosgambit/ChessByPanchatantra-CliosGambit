import React, { useRef, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Text,
  VStack,
  Box,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiUpload } from 'react-icons/fi';
import { parsePrinciplesFile } from '../../utils/principlesCsv';
import { bulkImportPrinciples } from '../../services/principlesService';

function BulkImportModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [previewCount, setPreviewCount] = useState(0);
  const [parsedRows, setParsedRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const dropBorder = useColorModeValue('gray.200', 'whiteAlpha.300');
  const dropBg = useColorModeValue('gray.50', 'whiteAlpha.50');
  const subColor = useColorModeValue('gray.600', 'gray.400');

  const reset = () => {
    setFile(null);
    setPreviewCount(0);
    setParsedRows([]);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setError('');
    setFile(selected);
    try {
      const rows = await parsePrinciplesFile(selected);
      setParsedRows(rows);
      setPreviewCount(rows.length);
    } catch (err) {
      setParsedRows([]);
      setPreviewCount(0);
      setError(err.message || 'Failed to parse file');
    }
  };

  const handleImport = async () => {
    if (!parsedRows.length) {
      setError('Select a valid CSV or XLSX file first.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await bulkImportPrinciples(parsedRows);
      onSuccess?.(result);
      handleClose();
    } catch (err) {
      setError(err.message || 'Bulk import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Bulk Import Principles</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Text fontSize="sm" color={subColor}>
              Upload CSV containing only a <strong>principle</strong> column. IDs are auto-generated
              during import.
            </Text>
            <Box
              borderWidth="2px"
              borderStyle="dashed"
              borderColor={dropBorder}
              borderRadius="lg"
              bg={dropBg}
              py={8}
              px={4}
              textAlign="center"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="principles-bulk-upload"
              />
              <label htmlFor="principles-bulk-upload">
                <Button
                  as="span"
                  leftIcon={<FiUpload />}
                  colorScheme="blue"
                  size="sm"
                  cursor="pointer"
                  aria-label="Choose file to import"
                >
                  Choose File
                </Button>
              </label>
              {file && (
                <Text mt={3} fontSize="sm" color={subColor}>
                  {file.name}
                  {previewCount > 0 ? ` · ${previewCount} row${previewCount === 1 ? '' : 's'} ready` : ''}
                </Text>
              )}
            </Box>
            {error && (
              <Text fontSize="sm" color="red.500">
                {error}
              </Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={handleClose} isDisabled={loading}>
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleImport}
            isLoading={loading}
            isDisabled={!parsedRows.length}
          >
            Import
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default BulkImportModal;
