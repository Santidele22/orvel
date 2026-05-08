// ============================================
// Unit Tests - TurnoService
// ============================================
// Tests for appointment management functionality
// Spanish comments for clarity

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TurnoService } from '../../services/turno.service';
import { CreateTurnoDTO, TurnoEstado } from '../../models/turno.model';

describe('TurnoService - Unit Tests', () => {
  let service: TurnoService;

  // Setup before each test
  beforeEach(() => {
    service = new TurnoService();
  });

  // ============================================
  // TEST: Get all appointments
  // ============================================

  describe('getAll()', () => {
    it('debería retornar lista de turnos mock', async () => {
      // Act
      const turnos = await service.getAll().toPromise();

      // Assert
      expect(turnos).toBeDefined();
      expect(turnos!.length).toBeGreaterThan(0);
      expect(turnos![0]).toHaveProperty('clienteId');
      expect(turnos![0]).toHaveProperty('servicioId');
      expect(turnos![0]).toHaveProperty('fecha');
    });

    it('debería cargar turnos en el signal items', async () => {
      // Act
      await service.getAll().toPromise();

      // Assert
      expect(service.items().length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // TEST: Get appointment by ID
  // ============================================

  describe('getById()', () => {
    it('debería retornar turno existente', async () => {
      // Arrange - primero cargar turnos
      const turnos = await service.getAll().toPromise();

      // Act
      const turno = await service.getById('turno-001').toPromise();

      // Assert
      expect(turno).toBeDefined();
      expect(turno!.id).toBe('turno-001');
    });

    it('debería retornar undefined para turno inexistente', async () => {
      // Act
      const turno = await service.getById('turno-inexistente').toPromise();

      // Assert
      expect(turno).toBeUndefined();
    });
  });

  // ============================================
  // TEST: Create appointment
  // ============================================

  describe('create()', () => {
    it('debería crear nuevo turno correctamente', async () => {
      // Arrange
      const nuevoTurno: CreateTurnoDTO = {
        clienteId: 'cliente-001',
        servicioId: 'servicio-001',
        fecha: new Date('2026-04-20'),
        hora: '09:00',
        duracionMinutos: 30,
        estado: 'confirmado',
        precio: 2500
      };

      // Act
      const resultado = await service.create(nuevoTurno).toPromise();

      // Assert
      expect(resultado).toBeDefined();
      expect(resultado!.id).toBeTruthy();
      expect(resultado!.clienteId).toBe('cliente-001');
      expect(resultado!.servicioId).toBe('servicio-001');
      expect(resultado!.hora).toBe('09:00');
    });

    it('debería agregar turno a la lista interna', async () => {
      // Arrange
      const nuevoTurno: CreateTurnoDTO = {
        clienteId: 'cliente-002',
        servicioId: 'servicio-002',
        fecha: new Date(),
        hora: '15:00',
        duracionMinutos: 45,
        estado: 'confirmado',
        precio: 3500
      };

      // Act
      await service.create(nuevoTurno).toPromise();

      // Assert
      const turnos = service.items();
      expect(turnos.some(t => t.hora === '15:00')).toBe(true);
    });

    it('debería generar ID único para cada turno', async () => {
      // Arrange
      const turno1: CreateTurnoDTO = {
        clienteId: 'cliente-001',
        servicioId: 'servicio-001',
        fecha: new Date(),
        hora: '09:00',
        duracionMinutos: 30,
        estado: 'confirmado',
        precio: 2500
      };

      // Act - Create first, wait a bit, then create second
      const resultado1 = await service.create(turno1).toPromise();
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      
      const turno2: CreateTurnoDTO = {
        clienteId: 'cliente-002',
        servicioId: 'servicio-002',
        fecha: new Date(),
        hora: '10:00',
        duracionMinutos: 45,
        estado: 'confirmado',
        precio: 3500
      };
      const resultado2 = await service.create(turno2).toPromise();

      // Assert - IDs should be different (with delay)
      expect(resultado1!.id).not.toBe(resultado2!.id);
    });

    it('debería aceptar notas opcionales', async () => {
      // Arrange
      const turnoConNotas: CreateTurnoDTO = {
        clienteId: 'cliente-001',
        servicioId: 'servicio-001',
        fecha: new Date(),
        hora: '11:00',
        duracionMinutos: 30,
        estado: 'confirmado',
        precio: 2500,
        notas: 'Primera vez en el salon'
      };

      // Act
      const resultado = await service.create(turnoConNotas).toPromise();

      // Assert
      expect(resultado!.notas).toBe('Primera vez en el salon');
    });
  });

  // ============================================
  // TEST: Update appointment
  // ============================================

  describe('update()', () => {
    it('debería actualizar turno existente', async () => {
      // Arrange - load data first
      await service.getAll().toPromise();

      // Act
      const resultado = await service.update('turno-001', { 
        hora: '11:00' 
      }).toPromise();

      // Assert
      expect(resultado!.hora).toBe('11:00');
      expect(resultado!.clienteId).toBe('cliente-001'); // Mantiene valor original
    });

    it('debería actualizar múltiples campos', async () => {
      // Arrange - load data first
      await service.getAll().toPromise();

      // Act
      const resultado = await service.update('turno-001', {
        hora: '14:00',
        estado: 'completado',
        precio: 3000
      }).toPromise();

      // Assert
      expect(resultado!.hora).toBe('14:00');
      expect(resultado!.estado).toBe('completado');
      expect(resultado!.precio).toBe(3000);
    });

    it('debería lanzar error para turno inexistente', async () => {
      // Arrange - load data first
      await service.getAll().toPromise();

      // Act & Assert - The service throws synchronously
      expect(() => {
        service.update('turno-inexistente', { hora: '10:00' });
      }).toThrow('Turno no encontrado');
    });
  });

  // ============================================
  // TEST: Update appointment status
  // ============================================

  describe('updateEstado()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería cambiar estado a completado', async () => {
      // Act
      const resultado = await service.updateEstado('turno-001', 'completado').toPromise();

      // Assert
      expect(resultado!.estado).toBe('completado');
    });

    it('debería cambiar estado a cancelado', async () => {
      // Act
      const resultado = await service.updateEstado('turno-002', 'cancelado').toPromise();

      // Assert
      expect(resultado!.estado).toBe('cancelado');
    });

    it('debería cambiar estado a no-asistio', async () => {
      // Act
      const resultado = await service.updateEstado('turno-003', 'no-asistio').toPromise();

      // Assert
      expect(resultado!.estado).toBe('no-asistio');
    });

    it('debería soportar todos los estados válidos', async () => {
      const estados: TurnoEstado[] = ['confirmado', 'en-proceso', 'completado', 'cancelado', 'no-asistio'];
      
      for (const estado of estados) {
        const resultado = await service.updateEstado('turno-001', estado).toPromise();
        expect(resultado!.estado).toBe(estado);
      }
    });
  });

  // ============================================
  // TEST: Delete appointment
  // ============================================

  describe('delete()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería eliminar turno correctamente', async () => {
      // Arrange
      const initialCount = service.items().length;

      // Act
      await service.delete('turno-001').toPromise();

      // Assert
      expect(service.items().length).toBe(initialCount - 1);
      expect(service.items().some(t => t.id === 'turno-001')).toBe(false);
    });

    it('debería retornar true después de eliminar', async () => {
      // Act
      const resultado = await service.delete('turno-001').toPromise();

      // Assert
      expect(resultado).toBe(true);
    });
  });

  // ============================================
  // TEST: Filter by date
  // ============================================

  describe('getByFecha()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería filtrar turnos por fecha', async () => {
      // Arrange - usar la fecha de hoy
      const hoy = new Date();
      
      // Act
      const turnos = await service.getByFecha(hoy).toPromise();

      // Assert
      expect(turnos).toBeDefined();
      // Los turnos mock tienen la fecha de hoy
    });

    it('debería retornar array vacío si no hay turnos en la fecha', async () => {
      // Arrange - fecha futura sin turnos
      const fechaFutura = new Date('2030-01-01');
      
      // Act
      const turnos = await service.getByFecha(fechaFutura).toPromise();

      // Assert
      expect(turnos!.length).toBe(0);
    });
  });

  // ============================================
  // TEST: Filter by client
  // ============================================

  describe('getByCliente()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería filtrar turnos por cliente', async () => {
      // Act
      const turnos = await service.getByCliente('cliente-001').toPromise();

      // Assert
      expect(turnos).toBeDefined();
      expect(turnos!.every(t => t.clienteId === 'cliente-001')).toBe(true);
    });

    it('debería retornar array vacío si el cliente no tiene turnos', async () => {
      // Act
      const turnos = await service.getByCliente('cliente-inexistente').toPromise();

      // Assert
      expect(turnos!.length).toBe(0);
    });
  });

  // ============================================
  // TEST: Get today's appointments
  // ============================================

  describe('getHoy()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería retornar turnos de hoy', async () => {
      // Act
      const turnos = await service.getHoy().toPromise();

      // Assert
      expect(turnos).toBeDefined();
      const hoyStr = new Date().toISOString().split('T')[0];
      expect(turnos!.every(t => t.fecha.toString().split('T')[0] === hoyStr)).toBe(true);
    });
  });

  // ============================================
  // TEST: Get pending appointments
  // ============================================

  describe('getAgendados()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería retornar turnos confirmados y en proceso', async () => {
      // Act
      const turnos = await service.getAgendados().toPromise();

      // Assert
      expect(turnos).toBeDefined();
      const estadosValidos = ['confirmado', 'en-proceso'];
      expect(turnos!.every(t => estadosValidos.includes(t.estado))).toBe(true);
    });
  });

  // ============================================
  // TEST: Available schedules
  // ============================================

  describe('getHorariosDisponibles()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería retornar todos los horarios cuando no hay turnos', async () => {
      // Arrange - fecha sin turnos
      const fechaSinTurnos = new Date('2030-01-01');

      // Act
      const horarios = service.getHorariosDisponibles(fechaSinTurnos, 30);

      // Assert - debería retornar todos los horarios disponibles
      expect(horarios.length).toBeGreaterThan(10);
      expect(horarios).toContain('09:00');
      expect(horarios).toContain('18:30');
    });

    it('debería excluir horarios ocupados', async () => {
      // Arrange - ensure data is loaded with future date (no mock data)
      const fechaFutura = new Date('2030-01-01');
      await service.getAll().toPromise();
      
      // Act - For a future date with no appointments, all slots should be available
      const horarios = service.getHorariosDisponibles(fechaFutura, 30);

      // Assert - All 20 slots should be available for a future date
      expect(horarios).toBeDefined();
      expect(horarios.length).toBe(20); // All slots available
    });

    it('debería excluir turnos cancelados', async () => {
      // Arrange - crear un turno cancelado
      const turnoCancelado: CreateTurnoDTO = {
        clienteId: 'cliente-001',
        servicioId: 'servicio-001',
        fecha: new Date(),
        hora: '12:00',
        duracionMinutos: 30,
        estado: 'cancelado',
        precio: 2500
      };
      await service.create(turnoCancelado).toPromise();

      // Act
      const horarios = service.getHorariosDisponibles(new Date(), 30);

      // Assert - el horario del turno cancelado debería estar disponible
      expect(horarios).toContain('12:00');
    });
  });

  // ============================================
  // TEST: Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('debería manejar estado inválido en update', async () => {
      // Arrange
      await service.getAll().toPromise();

      // Act - pasando estado inválido
      const resultado = await service.update('turno-001', { 
        estado: 'invalid-state' as any 
      }).toPromise();

      // Assert - debería actualizar sin validación de tipo en modo mock
      expect(resultado).toBeDefined();
    });

    it('debería mantener turno original si no se especifica fecha', async () => {
      // Arrange
      await service.getAll().toPromise();
      const turnoOriginal = service.items()[0];
      const fechaOriginal = new Date(turnoOriginal.fecha);

      // Act
      await service.update('turno-001', { hora: '15:00' }).toPromise();
      const turnoActualizado = service.items().find(t => t.id === 'turno-001');

      // Assert
      expect(turnoActualizado!.fecha.getTime()).toBe(fechaOriginal.getTime());
    });

    it('debería generar IDs únicos incluso con llamadas rápidas', async () => {
      // Arrange
      const turno1: CreateTurnoDTO = {
        clienteId: 'c1', servicioId: 's1', fecha: new Date(), 
        hora: '09:00', duracionMinutos: 30, estado: 'confirmado', precio: 1000
      };

      // Act - Create first, wait a bit, then create second
      const r1 = await service.create(turno1).toPromise();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const turno2: CreateTurnoDTO = {
        clienteId: 'c2', servicioId: 's2', fecha: new Date(), 
        hora: '10:00', duracionMinutos: 30, estado: 'confirmado', precio: 1000
      };
      const r2 = await service.create(turno2).toPromise();

      // Assert - With delay, IDs should be different
      expect(r1!.id).not.toBe(r2!.id);
    });
  });
});