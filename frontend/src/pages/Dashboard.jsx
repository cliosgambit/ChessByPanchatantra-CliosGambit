import React from 'react';
import { Box, Grid, GridItem } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import DashboardSectionCard from '../components/dashboard/DashboardSectionCard';
import { DASHBOARD_SECTIONS } from '../components/dashboard/dashboardPalettes';
import { useAuth } from '../context/AuthContext';

function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = (user?.role || 'guest').toLowerCase();

  const visibleSections = DASHBOARD_SECTIONS.filter((section) =>
    section.roles.includes(role)
  );

  return (
    <Box px={{ base: 4, md: 8, xl: 10 }} pt={{ base: 6, md: 8 }} pb={10}>
      <Grid
        templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }}
        gap={5}
      >
        {visibleSections.map((section, index) => (
          <GridItem key={section.id}>
            <DashboardSectionCard
              label={section.label}
              bgColor={section.bgColor}
              bgColorDark={section.bgColorDark}
              textColor={section.textColor}
              textColorDark={section.textColorDark}
              borderColor={section.borderColor}
              borderColorDark={section.borderColorDark}
              index={index}
              onClick={() => navigate(section.path)}
            />
          </GridItem>
        ))}
      </Grid>
    </Box>
  );
}

export default Dashboard;
