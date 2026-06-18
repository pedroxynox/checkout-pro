/**
 * Teste de UI da leitura de código de barras (Tarefa 21.1).
 *
 * Com a câmera simulada (mock de `expo-camera`), valida que o leitor:
 *  - dispara `aoLer` com o código lido pela câmera (evento `onBarcodeScanned`);
 *  - permite a entrada manual do código como alternativa;
 *  - não dispara leituras duplicadas em sequência imediata (Req 3.1.1).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { LeitorCodigoBarras } from './LeitorCodigoBarras';

describe('LeitorCodigoBarras (Tarefa 21.1)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  it('dispara aoLer com o código lido pela câmera', () => {
    const aoLer = jest.fn();
    render(
      <LeitorCodigoBarras visivel aoLer={aoLer} aoFechar={jest.fn()} />,
    );

    const camera = screen.getByTestId('camera-view');
    // Simula a leitura de um código de barras pela câmera.
    fireEvent(camera, 'onBarcodeScanned', { data: '7891000100103' });

    expect(aoLer).toHaveBeenCalledTimes(1);
    expect(aoLer).toHaveBeenCalledWith('7891000100103');
  });

  it('ignora leituras duplicadas imediatas do mesmo código', () => {
    const aoLer = jest.fn();
    render(
      <LeitorCodigoBarras visivel aoLer={aoLer} aoFechar={jest.fn()} />,
    );
    const camera = screen.getByTestId('camera-view');

    fireEvent(camera, 'onBarcodeScanned', { data: '111' });
    fireEvent(camera, 'onBarcodeScanned', { data: '111' });

    // A segunda leitura imediata é descartada (trava de releitura).
    expect(aoLer).toHaveBeenCalledTimes(1);
  });

  it('permite informar o código manualmente', () => {
    const aoLer = jest.fn();
    render(
      <LeitorCodigoBarras visivel aoLer={aoLer} aoFechar={jest.fn()} />,
    );

    fireEvent.changeText(
      screen.getByPlaceholderText('Código de barras'),
      '  789999  ',
    );
    fireEvent.press(screen.getByText('Confirmar'));

    expect(aoLer).toHaveBeenCalledWith('789999');
  });

  it('aciona aoFechar ao tocar em fechar', () => {
    const aoFechar = jest.fn();
    render(
      <LeitorCodigoBarras visivel aoLer={jest.fn()} aoFechar={aoFechar} />,
    );

    fireEvent.press(screen.getByLabelText('Fechar'));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});
