// KB-003 Turnos CRUD - Load TDD Guard Tests
// =========================================
// These tests verify real Supabase data loading for TurnosListPage
// Tests should FAIL (RED) initially because TurnoService/ClienteService use mock data
// Tests will pass after Magnus implements real Supabase queries

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TurnoService } from '../../features/booking/data-access/turno.facade';
import type { ClienteService } from '../../services/cliente.service';
import type { ServicioService } from '../../services/servicio.service';
import { firstValueFrom } from 'rxjs';
import { createMockClienteService, createMockServicioService, createMockTurnoService } from '../helpers/turno-service-testbed';

describe('KB-003: Turnos CRUD - Load (TDD Guard)', () => {
  let turnoService: TurnoService;
  let clienteService: ClienteService;
  let servicioService: ServicioService;

  beforeEach(() => {
    turnoService = createMockTurnoService();
    clienteService = createMockClienteService();
    servicioService = createMockServicioService();
  });

  // ========================================================================
  // TEST GROUP 1: Bookings Load from Supabase (RED TESTS)
  // ========================================================================

  describe('Bookings Load (Supabase Integration)', () => {
    it('RED: should load bookings from Supabase, not mock data', async () => {
      // Act - Get bookings
      const turnos = await firstValueFrom(turnoService.getAll());
      
      // Assert - Check for real Supabase IDs
      // Current mock uses: turno-001, turno-002, etc.
      // Real Supabase should use: appt-uuid or similar
      const hasRealSupabaseIds = turnos.some(t => 
        t.id.startsWith('appt-') || 
        (t.id.includes('-') && !t.id.match(/^turno-\d+$/))
      );
      
      // RED: This FAILS because current implementation uses mock data
      expect(hasRealSupabaseIds, 'Should have real Supabase IDs, not mock like "turno-001"').toBe(true);
    });

    it('RED: should return bookings when Supabase provider is set', async () => {
      // Arrange - Switch to Supabase
      turnoService.setProvider('supabase');
      
      // Act
      const turnos = await firstValueFrom(turnoService.getAll());
      
      // RED: Current implementation returns empty array for 'supabase' provider
      expect(turnos.length, 'Should return booking data').toBeGreaterThan(0);
    });

    it('RED: should load bookings with valid customer references', async () => {
      // Act
      const turnos = await firstValueFrom(turnoService.getAll());
      
      // Check customer IDs are not mock-style
      const hasValidCustomerRefs = turnos.every(t => 
        t.clienteId && (t.clienteId.startsWith('cust-') || t.clienteId.match(/^[a-f0-9-]{36}$/))
      );
      
      // RED: Mock uses cliente-001, cliente-002
      expect(hasValidCustomerRefs, 'Customer IDs should be real Supabase refs').toBe(true);
    });

    it('RED: should load bookings with valid service references', async () => {
      // Act
      const turnos = await firstValueFrom(turnoService.getAll());
      
      // Check service IDs
      const hasValidServiceRefs = turnos.every(t => 
        t.servicioId && (t.servicioId.startsWith('svc-') || t.servicioId.match(/^[a-f0-9-]{36}$/))
      );
      
      expect(hasValidServiceRefs, 'Service IDs should be real Supabase refs').toBe(true);
    });
  });

  // ========================================================================
  // TEST GROUP 2: Customer Integration (RED TESTS)
  // ========================================================================

  describe('Customer Integration (Supabase customers table)', () => {
    it('RED: should load customers from Supabase', async () => {
      // Act
      const clientes = await firstValueFrom(clienteService.getAll());
      
      // Check for real IDs
      const hasRealCustomerIds = clientes.some(c => 
        c.id.startsWith('cust-') || c.id.match(/^[a-f0-9-]{36}$/)
      );
      
      // RED: Mock uses cliente-001, cliente-002
      expect(hasRealCustomerIds, 'Should load real customers from Supabase').toBe(true);
    });

    it('RED: should return data with Supabase provider', async () => {
      // Arrange
      clienteService.setProvider('supabase');
      
      // Act
      const clientes = await firstValueFrom(clienteService.getAll());
      
      // RED: Returns empty array when provider is 'supabase'
      expect(clientes.length, 'Should return customer data').toBeGreaterThan(0);
    });

    it('GREEN: loads customer data structure correctly', async () => {
      // Act
      const clientes = await firstValueFrom(clienteService.getAll());
      
      // GREEN: Basic structure works with mock
      expect(clientes.length).toBeGreaterThan(0);
      expect(clientes[0]).toHaveProperty('nombre');
      expect(clientes[0]).toHaveProperty('apellido');
    });
  });

  // ========================================================================
  // TEST GROUP 3: Service Integration
  // ========================================================================

  describe('Service Integration', () => {
    it('GREEN: loads service data', async () => {
      const servicios = await firstValueFrom(servicioService.getAll());
      expect(servicios.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // TEST GROUP 4: State Management
  // ========================================================================

  describe('State Management', () => {
    it('GREEN: loading state works correctly', async () => {
      // Initially false
      expect(turnoService.isLoading()).toBe(false);
      
      // After query - should be false
      await firstValueFrom(turnoService.getAll());
      expect(turnoService.isLoading()).toBe(false);
    });
  });

  // ========================================================================
  // TEST GROUP 5: Date Filtering
  // ========================================================================

  describe('Date/Time Handling', () => {
    it('GREEN: filters by date', async () => {
      const testDate = new Date();
      const turnos = await firstValueFrom(turnoService.getByFecha(testDate));
      expect(Array.isArray(turnos)).toBe(true);
    });
  });

  // ========================================================================
  // TEST GROUP 6: Provider Switching (RED TESTS)
  // ========================================================================

  describe('Provider Switching', () => {
    it('GREEN: has setProvider method', () => {
      expect(typeof turnoService.setProvider).toBe('function');
    });

    it('RED: provider switch changes data source', async () => {
      // Get mock data
      const mockTurnos = await firstValueFrom(turnoService.getAll());
      const mockCount = mockTurnos.length;
      
      // Switch to Supabase
      turnoService.setProvider('supabase');
      const supabaseTurnos = await firstValueFrom(turnoService.getAll());
      
      // RED: Supabase returns empty array, not real data
      expect(supabaseTurnos.length, 'Supabase should return data').toBeGreaterThan(0);
      expect(supabaseTurnos.length, 'Should be different from mock').not.toBe(mockCount);
    });
  });

  // ========================================================================
  // TEST GROUP 7: Mock vs Supabase Data (RED TESTS)
  // ========================================================================

  describe('Mock vs Supabase Data Verification', () => {
    it('RED: should not return mock IDs with Supabase provider', async () => {
      turnoService.setProvider('supabase');
      const turnos = await firstValueFrom(turnoService.getAll());
      
      // Check no mock IDs
      const hasMockIds = turnos.some(t => 
        t.id === 'turno-001' ||
        t.id === 'turno-002' ||
        t.id === 'turno-003'
      );
      
      // RED: With real Supabase, should have no mock IDs
      expect(turnos.length, 'Should have data').toBeGreaterThan(0);
      expect(hasMockIds, 'Should not have mock IDs').toBe(false);
    });

    it('RED: should not return mock data', async () => {
      // Current implementation returns mock data
      const turnos = await firstValueFrom(turnoService.getAll());
      
      // Mock data has IDs starting with "turno-"
      const isMockData = turnos.some(t => t.id === 'turno-001');
      
      // RED: Currently returns mock data
      expect(isMockData, 'Should not use mock data with real Supabase').toBe(false);
    });
  });
});
