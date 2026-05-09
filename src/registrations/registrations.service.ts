import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '../config/config.service';
import { v4 as uuidv4 } from 'uuid';

export interface PredictionInput {
  match_id: number;
  goals_local: number;
  goals_visitor: number;
}

export interface RegisterInput {
  factura: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  telefono?: string;
  email?: string;
  champion_team?: string;
  predictions: PredictionInput[];
}

@Injectable()
export class RegistrationsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // Verifica si factura está disponible localmente
  async checkFacturaLocal(factura: string): Promise<boolean> {
    const existing = await this.prisma.registration.findUnique({ where: { factura } });
    return !existing;
  }

  // Busca participante por cédula para pre-llenar el formulario
  async getParticipantByCedula(cedula: string) {
    return this.prisma.participant.findUnique({ where: { cedula } });
  }

  // Guarda un nuevo registro con sus predicciones
  async register(input: RegisterInput) {
    // 1. Factura única
    const facturaExists = await this.prisma.registration.findUnique({
      where: { factura: input.factura },
    });
    if (facturaExists) {
      throw new BadRequestException('Esta factura ya fue utilizada');
    }

    // 2. Fase activa
    const phaseId = parseInt(this.config.phaseId);
    if (!phaseId) {
      throw new BadRequestException('No hay fase activa. Sincroniza el tótem.');
    }

    // 3. Validar cantidad de predicciones
    const phase = await this.prisma.phase.findUnique({ where: { id: phaseId } });
    if (phase && input.predictions.length !== phase.predictions_required) {
      throw new BadRequestException(
        `Debes hacer exactamente ${phase.predictions_required} predicciones`,
      );
    }

    // 4. Crear o encontrar participante por cédula
    let participant = await this.prisma.participant.findUnique({
      where: { cedula: input.cedula },
    });
    if (!participant) {
      participant = await this.prisma.participant.create({
        data: {
          cedula:    input.cedula,
          nombres:   input.nombres,
          apellidos: input.apellidos,
          telefono:  input.telefono ?? null,
          email:     input.email ?? null,
        },
      });
    }

    // 5. Crear registro con UUID local
    const registration = await this.prisma.registration.create({
      data: {
        local_id:       uuidv4(),
        factura:        input.factura,
        participant_id: participant.id,
        phase_id:       phaseId,
        champion_team:  input.champion_team ?? null,
        synced:         0,
        predictions: {
          create: input.predictions.map(p => ({
            match_id:      p.match_id,
            goals_local:   p.goals_local,
            goals_visitor: p.goals_visitor,
          })),
        },
      },
    });

    return {
      status:  'ok',
      message: '¡Registro guardado exitosamente!',
      local_id: registration.local_id,
      participant: {
        nombres:   participant.nombres,
        apellidos: participant.apellidos,
      },
    };
  }

  async getStats() {
    const [total, pending] = await Promise.all([
      this.prisma.registration.count(),
      this.prisma.registration.count({ where: { synced: 0 } }),
    ]);
    return { total, pending_sync: pending };
  }
}
