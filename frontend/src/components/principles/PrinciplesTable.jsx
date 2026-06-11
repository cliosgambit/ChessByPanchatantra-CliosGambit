import React, { forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  HStack,
  Button,
  useColorModeValue,
} from '@chakra-ui/react';

function formatPrincipleId(id) {
  if (!id) return '—';
  const str = String(id);
  return str.startsWith('P') ? str : `P${str}`;
}

const PrinciplesTable = forwardRef(function PrinciplesTable({ principles, onEdit, onDelete }, scrollRef) {
  const navigate = useNavigate();
  const headerBg = useColorModeValue('gray.50', 'navy.700');
  const headerColor = useColorModeValue('gray.500', 'gray.400');
  const rowBorder = useColorModeValue('gray.100', 'whiteAlpha.100');
  const rowHover = useColorModeValue('gray.50', 'whiteAlpha.50');
  const idColor = useColorModeValue('navy.700', 'gold.300');
  const textColor = useColorModeValue('navy.800', 'white');
  const subColor = useColorModeValue('gray.500', 'gray.400');

  const thProps = {
    py: 3.5,
    px: { base: 3, md: 4 },
    color: headerColor,
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    bg: headerBg,
    borderBottomWidth: '1px',
    borderColor: rowBorder,
  };

  return (
    <Box
      ref={scrollRef}
      flex="1"
      minH={0}
      overflowY="auto"
      overflowX="auto"
      sx={{ WebkitOverflowScrolling: 'touch' }}
    >
      <Table
        variant="unstyled"
        size="md"
        sx={{
          tableLayout: 'fixed',
          width: '100%',
          minWidth: '640px',
          borderCollapse: 'separate',
          borderSpacing: 0,
          'th, td': {
            verticalAlign: 'top',
            overflow: 'visible',
          },
          'td.principle-cell, td.principle-cell *': {
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            overflow: 'visible',
            textOverflow: 'unset',
            maxWidth: 'none',
            WebkitLineClamp: 'unset',
            lineClamp: 'unset',
          },
        }}
      >
        <colgroup>
          <col style={{ width: '8%' }} />
          <col style={{ width: '72%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <Thead position="sticky" top={0} zIndex={20} sx={{ isolation: 'isolate' }}>
          <Tr>
            <Th scope="col" {...thProps}>
              ID
            </Th>
            <Th scope="col" {...thProps}>
              Principle
            </Th>
            <Th scope="col" {...thProps} textAlign="right">
              Actions
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {principles.length === 0 ? (
            <Tr>
              <Td colSpan={3} py={14} textAlign="center">
                <Text color={subColor} fontSize="sm">
                  No principles found.
                </Text>
              </Td>
            </Tr>
          ) : (
            principles.map((principle) => {
              const label = principle.principle || principle.name || '—';
              const openDetails = () => navigate(`/principles/${principle.id}`);
              return (
                <Tr
                  key={principle.id}
                  borderBottomWidth="1px"
                  borderColor={rowBorder}
                  _last={{ borderBottom: 'none' }}
                  _hover={{ bg: rowHover }}
                  sx={{ transition: 'background 0.2s ease', cursor: 'pointer' }}
                  onClick={openDetails}
                >
                  <Td py={4} px={{ base: 3, md: 6 }} whiteSpace="nowrap">
                    <Box
                      fontSize="sm"
                      fontWeight="700"
                      color={idColor}
                      fontFamily="mono"
                      letterSpacing="0.02em"
                    >
                      {formatPrincipleId(principle.id)}
                    </Box>
                  </Td>
                  <Td className="principle-cell" py={4} px={{ base: 3, md: 6 }}>
                    <Box
                      as="button"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetails();
                      }}
                      fontSize="sm"
                      fontWeight="500"
                      color={textColor}
                      lineHeight="1.5rem"
                      whiteSpace="normal"
                      wordBreak="break-word"
                      overflow="visible"
                      textAlign="left"
                      bg="transparent"
                      border="none"
                      p={0}
                      w="100%"
                      cursor="pointer"
                      _hover={{ textDecoration: 'underline' }}
                    >
                      {label}
                    </Box>
                  </Td>
                  <Td py={4} px={{ base: 3, md: 6 }} whiteSpace="nowrap">
                    <HStack spacing={2} justify="flex-end">
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="gray"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit?.(principle);
                        }}
                        aria-label={`Edit principle ${formatPrincipleId(principle.id)}`}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        colorScheme="red"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete?.(principle);
                        }}
                        aria-label={`Delete principle ${formatPrincipleId(principle.id)}`}
                      >
                        Delete
                      </Button>
                    </HStack>
                  </Td>
                </Tr>
              );
            })
          )}
        </Tbody>
      </Table>
    </Box>
  );
});

export default PrinciplesTable;
