/**
 * Testes do SeletorPeriodo — contador de dias ao vivo e duração editável.
 *
 * O componente é controlado (o pai guarda início/fim), então os testes fixam as
 * props e verificam o que ele exibe e o que devolve pelos callbacks.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { SeletorPeriodo } from './SeletorPeriodo';

/** Props mínimas, com os callbacks espionáveis. */
function montar(
  props: Partial<React.ComponentProps<typeof SeletorPeriodo>> = {},
): {
  aoMudarInicio: jest.Mock;
  aoMudarFim: jest.Mock;
} {
  const aoMudarInicio = jest.fn();
  const aoMudarFim = jest.fn();
  render(
    <SeletorPeriodo
      inicio="2026-10-10"
      fim="2026-10-14"
      aoMudarInicio={aoMudarInicio}
      aoMudarFim={aoMudarFim}
      {...props}
    />,
  );
  return { aoMudarInicio, aoMudarFim };
}

describe('SeletorPeriodo — contador de dias', () => {
  it('mostra a duração e o intervalo (10/10 a 14/10 = 5 dias)', () => {
    montar();

    expect(screen.getByText('5 dias · 10/10 a 14/10')).toBeTruthy();
  });

  it('usa o singular e omite o intervalo quando é um único dia', () => {
    montar({ inicio: '2026-10-10', fim: '2026-10-10' });

    expect(screen.getByText('1 dia · 10/10')).toBeTruthy();
  });

  it('conta domingos e feriados como qualquer outro dia', () => {
    // Semana do Ano Novo: o sistema grava os 7 dias corridos.
    montar({ inicio: '2026-01-01', fim: '2026-01-07' });

    expect(screen.getByText('7 dias · 01/01 a 07/01')).toBeTruthy();
  });

  it('preenche o campo de duração com os dias calculados', () => {
    montar();

    expect(screen.getByLabelText('Duração em dias').props.value).toBe('5');
  });
});

describe('SeletorPeriodo — digitar a duração', () => {
  it('reposiciona o fim a partir do início', () => {
    const { aoMudarFim } = montar();

    fireEvent.changeText(screen.getByLabelText('Duração em dias'), '3');

    // 3 dias a partir de 10/10 terminam em 12/10 (extremos inclusive).
    expect(aoMudarFim).toHaveBeenCalledWith('2026-10-12');
  });

  it('aceita uma duração longa sem mexer no início', () => {
    const { aoMudarInicio, aoMudarFim } = montar();

    fireEvent.changeText(screen.getByLabelText('Duração em dias'), '30');

    expect(aoMudarFim).toHaveBeenCalledWith('2026-11-08');
    expect(aoMudarInicio).not.toHaveBeenCalled();
  });

  it('ignora texto não numérico e o campo vazio', () => {
    const { aoMudarFim } = montar();

    fireEvent.changeText(screen.getByLabelText('Duração em dias'), 'abc');
    fireEvent.changeText(screen.getByLabelText('Duração em dias'), '');

    expect(aoMudarFim).not.toHaveBeenCalled();
  });

  it('ignora duração acima do máximo aceito pelo backend', () => {
    const { aoMudarFim } = montar();

    fireEvent.changeText(screen.getByLabelText('Duração em dias'), '400');

    expect(aoMudarFim).not.toHaveBeenCalled();
  });
});

describe('SeletorPeriodo — mover as datas', () => {
  it('mover o início PRESERVA a duração (desloca a janela inteira)', () => {
    const { aoMudarInicio, aoMudarFim } = montar();

    fireEvent.press(screen.getAllByLabelText('Próximo dia')[0]);

    expect(aoMudarInicio).toHaveBeenCalledWith('2026-10-11');
    // Antes, empurrar o início encolhia o período; agora os 5 dias seguem 5.
    expect(aoMudarFim).toHaveBeenCalledWith('2026-10-15');
  });

  it('mover o fim só muda o fim', () => {
    const { aoMudarInicio, aoMudarFim } = montar();

    fireEvent.press(screen.getAllByLabelText('Próximo dia')[1]);

    expect(aoMudarFim).toHaveBeenCalledWith('2026-10-15');
    expect(aoMudarInicio).not.toHaveBeenCalled();
  });

  it('o fim não volta antes do início', () => {
    const { aoMudarFim } = montar({ inicio: '2026-10-10', fim: '2026-10-10' });

    fireEvent.press(screen.getAllByLabelText('Dia anterior')[1]);

    expect(aoMudarFim).not.toHaveBeenCalled();
  });
});

describe('SeletorPeriodo — aviso por duração', () => {
  const TEXTO = 'Passa de 15 dias corridos.';

  it('não avisa quando a duração está no limite', () => {
    // 10/10 a 24/10 = exatamente 15 dias: ainda não passou.
    montar({ fim: '2026-10-24', limiteAviso: 15, textoAviso: TEXTO });

    expect(screen.queryByText(TEXTO)).toBeNull();
  });

  it('avisa quando a duração passa do limite', () => {
    // 10/10 a 25/10 = 16 dias.
    montar({ fim: '2026-10-25', limiteAviso: 15, textoAviso: TEXTO });

    expect(screen.getByText(TEXTO)).toBeTruthy();
  });

  it('sem limite configurado, nunca avisa', () => {
    montar({ fim: '2027-10-10' });

    expect(screen.queryByText(TEXTO)).toBeNull();
  });
});


describe('SeletorPeriodo — aviso extra (ciclo de folha)', () => {
  it('exibe o aviso extra quando fornecido', () => {
    montar({
      avisoExtra: { texto: 'Atravessa o fechamento da folha.', tom: 'info' },
    });

    expect(screen.getByText('Atravessa o fechamento da folha.')).toBeTruthy();
  });

  it('não exibe nada quando o aviso extra é nulo', () => {
    montar({ avisoExtra: null });

    expect(screen.queryByText(/fechamento/)).toBeNull();
  });

  it('convive com o aviso de duração (os dois aparecem)', () => {
    montar({
      fim: '2026-10-25', // 16 dias
      limiteAviso: 15,
      textoAviso: 'Passa de 15 dias.',
      avisoExtra: { texto: 'Ciclo fechado.', tom: 'alerta' },
    });

    expect(screen.getByText('Passa de 15 dias.')).toBeTruthy();
    expect(screen.getByText('Ciclo fechado.')).toBeTruthy();
  });
});
