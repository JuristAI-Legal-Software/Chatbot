import { fireEvent, render } from '@testing-library/react';
import Button from '../Button';

describe('Button', () => {
  it('renders with the correct type and children', () => {
    const regenerateLabel = 'Regenerate';
    const { getByTestId, getByText } = render(
      <Button
        type="regenerate"
        onClick={() => {
          return;
        }}
      >
        {regenerateLabel}
      </Button>,
    );

    expect(getByTestId('regenerate-generation-button')).toBeInTheDocument();
    expect(getByText(regenerateLabel)).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const continueLabel = 'Continue';
    const handleClick = jest.fn();
    const { getByText } = render(
      <Button type="continue" onClick={handleClick}>
        {continueLabel}
      </Button>,
    );

    fireEvent.click(getByText(continueLabel));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
