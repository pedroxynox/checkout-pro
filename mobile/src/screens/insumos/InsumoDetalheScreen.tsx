import React from 'react';
import { PropsTela } from '../../navigation/types';
import { EmConstrucao } from '../EmConstrucao';

export function InsumoDetalheScreen({
  route,
}: PropsTela<'InsumoDetalhe'>): React.ReactElement {
  return <EmConstrucao modulo={route.params.nome} />;
}

export default InsumoDetalheScreen;
