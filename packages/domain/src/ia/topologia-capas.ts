/** Indica la capa OSI aproximada de un rol (solo hint de layout). */
export function capaDeRol(rol: string): number {
  switch (rol) {
    case 'firewall': return 4
    case 'router': return 3
    case 'switch': return 2
    case 'ap': return 1
    case 'host': return 7
    case 'servidor': return 7
    default: return 3
  }
}
