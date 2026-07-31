import type {
  WorldChatItemShowcasePayload,
  WorldChatMessageDTO,
} from '@shared/types/world-chat';

function isTextPayload(
  payload: WorldChatMessageDTO['payload'],
): payload is { text: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'text' in payload &&
    typeof payload.text === 'string'
  );
}

function isItemShowcasePayload(
  payload: WorldChatMessageDTO['payload'],
): payload is WorldChatItemShowcasePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'itemType' in payload &&
    'snapshot' in payload
  );
}

export function getWorldChatMessageBody(message: WorldChatMessageDTO) {
  if (message.messageType === 'duel_invite') {
    return message.textContent || '赌战台有新战帖';
  }

  if (message.messageType === 'item_showcase' && isItemShowcasePayload(message.payload)) {
    const name =
      typeof message.payload.snapshot?.name === 'string'
        ? message.payload.snapshot.name
        : null;
    const text =
      typeof message.payload.text === 'string' ? message.payload.text : '';

    if (name && text) {
      return `展示了「${name}」 ${text}`;
    }

    if (name) {
      return `展示了「${name}」`;
    }

    return message.textContent || '【道具展示】';
  }

  if (isTextPayload(message.payload)) {
    return message.textContent || message.payload.text;
  }

  return message.textContent || '';
}
