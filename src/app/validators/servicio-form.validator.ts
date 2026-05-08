export type ServicioDraftInput = {
  nombre: string;
  categoria: string;
  duracionMinutos: number;
  precio: number;
  activo: boolean;
};

export type ServicioDraftValidationResult = {
  valid: boolean;
  errors: Record<string, string[]>;
};

export function validateServicioDraft(input: ServicioDraftInput): ServicioDraftValidationResult {
  const errors: Record<string, string[]> = {};

  const nombre = input.nombre.trim();
  const categoria = input.categoria.trim();

  if (!nombre) {
    pushError(errors, 'nombre', 'El nombre es obligatorio');
  }

  if (!categoria) {
    pushError(errors, 'categoria', 'La categoría es obligatoria');
  }

  if (!Number.isFinite(input.duracionMinutos) || input.duracionMinutos <= 0) {
    pushError(errors, 'duracionMinutos', 'La duración debe ser mayor a 0');
  }

  if (!Number.isFinite(input.precio) || input.precio < 0) {
    pushError(errors, 'precio', 'El precio no puede ser negativo');
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

function pushError(errors: Record<string, string[]>, field: string, message: string): void {
  if (!errors[field]) {
    errors[field] = [];
  }

  errors[field].push(message);
}
