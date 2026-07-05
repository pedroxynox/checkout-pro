/**
 * Testes do SeletorData com a prop `dataMinima` (Req 7.1).
 *
 * Valida o limite inferior: na fronteira (`valor === dataMinima`) o botão
 * "dia anterior" fica inativo e não navega; acima da fronteira, volta um dia.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { SeletorData } from './SeletorData';

describe('SeletorData com dataMinima', () => {
  it('não volta abaixo da data mínima (valor === dataMinima)', () => {
    const aoMudar = jest.fn();
    render(
      <SeletorData valor="2026-07-01" aoMudar={aoMudar} dataMinima="2026-07-01" />,
    );

    fireEvent.press(screen.getByLabelText('Dia anterior'));

    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('marca o botão "dia anterior" como desabilitado na fronteira', () => {
    render(
      <SeletorData valor="2026-07-01" aoMudar={jest.fn()} dataMinima="2026-07-01" />,
    );

    expect(
      screen.getByLabelText('Dia anterior').props.accessibilityState,
    ).toEqual({ disabled: true });
  });

  it('permite voltar quando o valor é maior que a data mínima', () => {
    const aoMudar = jest.fn();
    render(
      <SeletorData valor="2026-07-05" aoMudar={aoMudar} dataMinima="2026-07-01" />,
    );

    fireEvent.press(screen.getByLabelText('Dia anterior'));

    expect(aoMudar).toHaveBeenCalledWith('2026-07-04');
  });

  it('sem dataMinima, o botão "dia anterior" navega normalmente', () => {
    const aoMudar = jest.fn();
    render(<SeletorData valor="2026-07-01" aoMudar={aoMudar} />);

    fireEvent.press(screen.getByLabelText('Dia anterior'));

    expect(aoMudar).toHaveBeenCalledWith('2026-06-30');
  });
});
