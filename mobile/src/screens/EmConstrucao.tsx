/**
 * Placeholder de tela de módulo (usado na fundação — Task 17). As telas
 * completas de cada módulo são implementadas na Task 18.
 */
import React from 'react';
import { Tela, EstadoVazio } from '../components';

export function EmConstrucao({
  modulo,
}: {
  modulo: string;
}): React.ReactElement {
  return (
    <Tela>
      <EstadoVazio
        icone="construct-outline"
        titulo={modulo}
        descricao="Tela em construção. Será disponibilizada em breve."
      />
    </Tela>
  );
}

export default EmConstrucao;
