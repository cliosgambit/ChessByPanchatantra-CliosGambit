import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';
import {
  useDisclosure,
  useToast,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Button,
} from '@chakra-ui/react';
import PageShell from '../components/dashboard/PageShell';
import ErrorPanel from '../components/common/ErrorPanel';
import LoadingPanel from '../components/common/LoadingPanel';
import PrinciplesTable from '../components/principles/PrinciplesTable';
import PrinciplesPagination from '../components/principles/PrinciplesPagination';
import PrinciplesToolbar from '../components/principles/PrinciplesToolbar';
import EditPrincipleModal from '../components/principles/EditPrincipleModal';
import AddPrincipleModal from '../components/principles/AddPrincipleModal';
import BulkImportModal from '../components/principles/BulkImportModal';
import { downloadPrinciplesTemplate } from '../utils/principlesCsv';
import {
  deletePrinciple,
  fetchPrinciples,
  fetchPrincipleStats,
  subscribeToPrinciples,
  unsubscribeChannel,
} from '../services/principlesService';

const ITEMS_PER_PAGE = 50;

function Principles() {
  const [principles, setPrinciples] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [editPrinciple, setEditPrinciple] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { isOpen: editOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const { isOpen: addOpen, onOpen: onAddOpen, onClose: onAddClose } = useDisclosure();
  const { isOpen: importOpen, onOpen: onImportOpen, onClose: onImportClose } = useDisclosure();
  const { isOpen: deleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const cancelRef = useRef();
  const tableScrollRef = useRef(null);
  const toast = useToast();

  const totalPages = Math.max(1, Math.ceil(principles.length / ITEMS_PER_PAGE));

  const paginatedPrinciples = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return principles.slice(start, start + ITEMS_PER_PAGE);
  }, [principles, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    tableScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, counts] = await Promise.all([fetchPrinciples(), fetchPrincipleStats()]);
      setPrinciples(rows);
      setStats(counts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const channel = subscribeToPrinciples({
      onRefetch: load,
      onError: (e) => setError(e.message),
    });
    return () => {
      if (channel) unsubscribeChannel(channel);
    };
  }, [load]);

  const handleEdit = (principle) => {
    setEditPrinciple(principle);
    onEditOpen();
  };

  const handleDeleteRequest = (principle) => {
    setDeleteTarget(principle);
    onDeleteOpen();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await deletePrinciple(deleteTarget.id);
      setPrinciples((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast({ title: 'Principle deleted', status: 'success', duration: 2000 });
      onDeleteClose();
      setDeleteTarget(null);
      const counts = await fetchPrincipleStats();
      setStats(counts);
    } catch (err) {
      toast({ title: err.message || 'Failed to delete principle', status: 'error', duration: 3000 });
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkImportSuccess = (result) => {
    const { imported, skipped } = result;
    toast({
      title: 'Import complete',
      description: `Imported: ${imported} · Skipped: ${skipped}`,
      status: imported > 0 ? 'success' : 'warning',
      duration: 4000,
    });
    load();
  };

  const renderContent = () => {
    if (loading) {
      return (
        <Box flex="1" display="flex" alignItems="center" justifyContent="center" p={6}>
          <LoadingPanel message="Loading principles from database..." minH="200px" />
        </Box>
      );
    }
    if (error) {
      return (
        <Box flex="1" display="flex" alignItems="center" justifyContent="center" p={6}>
          <ErrorPanel message={error} onRetry={load} />
        </Box>
      );
    }
    return (
      <Box flex="1" minH={0} display="flex" flexDirection="column" overflow="hidden">
        <PrinciplesTable
          ref={tableScrollRef}
          principles={paginatedPrinciples}
          onEdit={handleEdit}
          onDelete={handleDeleteRequest}
        />
        <PrinciplesPagination
          page={currentPage}
          totalPages={totalPages}
          total={principles.length}
          pageSize={ITEMS_PER_PAGE}
          onPageChange={handlePageChange}
        />
      </Box>
    );
  };

  return (
    <PageShell
      layout="fill"
      title="Principles"
      subtitle={
        stats
          ? `${stats.principles} principles · ${stats.puzzles} puzzles · ${stats.ratedPuzzles} rated puzzles`
          : 'Curriculum principles from Supabase.'
      }
      actions={
        <PrinciplesToolbar
          onBulkImport={onImportOpen}
          onTemplate={downloadPrinciplesTemplate}
          onAdd={onAddOpen}
        />
      }
    >
      {renderContent()}

      <AddPrincipleModal
        isOpen={addOpen}
        onClose={onAddClose}
        onSuccess={() => {
          toast({ title: 'Principle added successfully', status: 'success', duration: 2000 });
          load();
        }}
      />

      <BulkImportModal
        isOpen={importOpen}
        onClose={onImportClose}
        onSuccess={handleBulkImportSuccess}
      />

      <EditPrincipleModal
        isOpen={editOpen}
        onClose={onEditClose}
        principle={editPrinciple}
        onSuccess={() => {
          toast({ title: 'Principle updated', status: 'success', duration: 2000 });
          load();
        }}
      />

      <AlertDialog isOpen={deleteOpen} leastDestructiveRef={cancelRef} onClose={onDeleteClose} isCentered>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Delete principle?
            </AlertDialogHeader>
            <AlertDialogBody>
              Are you sure you want to delete{' '}
              <strong>{deleteTarget?.principle || deleteTarget?.name || deleteTarget?.id}</strong>? This
              cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <Button ref={cancelRef} onClick={onDeleteClose} isDisabled={deleting}>
                Cancel
              </Button>
              <Button colorScheme="red" onClick={handleDeleteConfirm} isLoading={deleting}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </PageShell>
  );
}

export default Principles;
