import {
  Button,
  Color,
  EditBox,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Layers,
  Node,
  UITransform,
  Vec3,
  VerticalTextAlignment,
} from 'cc';

export const INK_WIDTH = 750;
export const INK_HEIGHT = 1334;
export const INK_UI_LAYER = Layers.Enum.UI_2D;

export const InkColors = {
  ink: new Color(42, 43, 38, 255),
  muted: new Color(105, 105, 96, 255),
  paper: new Color(246, 242, 232, 255),
  paperDeep: new Color(230, 223, 207, 255),
  accent: new Color(88, 100, 82, 255),
  accentSoft: new Color(218, 224, 211, 255),
  danger: new Color(128, 72, 66, 255),
  warning: new Color(151, 105, 44, 255),
  white: new Color(252, 250, 245, 255),
  line: new Color(173, 164, 146, 120),
};

export type InkButtonOptions = {
  secondary?: boolean;
  disabled?: boolean;
  height?: number;
  fontSize?: number;
};

export class InkUi {
  private root: Node | null = null;
  private toastNode: Node | null = null;

  constructor(private readonly host: Node) {}

  reset(name = 'InkPage'): Node {
    this.root?.destroy();
    this.toastNode = null;
    const root = new Node(name);
    root.layer = INK_UI_LAYER;
    this.host.addChild(root);
    const transform = root.addComponent(UITransform);
    transform.setContentSize(INK_WIDTH, INK_HEIGHT);
    root.setPosition(Vec3.ZERO);
    const graphics = root.addComponent(Graphics);
    graphics.fillColor = InkColors.paper;
    graphics.rect(-INK_WIDTH / 2, -INK_HEIGHT / 2, INK_WIDTH, INK_HEIGHT);
    graphics.fill();
    this.root = root;
    return root;
  }

  destroy(): void {
    this.root?.destroy();
    this.root = null;
    this.toastNode = null;
  }

  panel(
    parent: Node,
    x: number,
    y: number,
    width: number,
    height: number,
    color = InkColors.paperDeep,
    radius = 12,
  ): Node {
    const node = new Node('InkPanel');
    node.layer = INK_UI_LAYER;
    parent.addChild(node);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = color;
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    return node;
  }

  text(
    parent: Node,
    text: string,
    x: number,
    y: number,
    fontSize = 24,
    color = InkColors.ink,
    width = 640,
    height?: number,
    align: HorizontalTextAlignment = HorizontalTextAlignment.CENTER,
  ): Label {
    const node = new Node('InkLabel');
    node.layer = INK_UI_LAYER;
    parent.addChild(node);
    node.setPosition(new Vec3(x, y, 0));
    node.addComponent(UITransform).setContentSize(
      width,
      height ?? Math.max(54, fontSize * 2 + 8),
    );
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = color;
    label.enableWrapText = true;
    label.horizontalAlign = align;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    return label;
  }

  title(parent: Node, text: string, y = 520): Label {
    return this.text(parent, text, 0, y, 40, InkColors.ink, 650, 72);
  }

  sectionTitle(parent: Node, text: string, x = -280, y = 360): Label {
    return this.text(
      parent,
      text,
      x,
      y,
      25,
      InkColors.ink,
      260,
      52,
      HorizontalTextAlignment.LEFT,
    );
  }

  button(
    parent: Node,
    text: string,
    x: number,
    y: number,
    width: number,
    handler: () => void | Promise<void>,
    options: InkButtonOptions = {},
  ): Node {
    const height = options.height ?? 68;
    const node = this.panel(
      parent,
      x,
      y,
      width,
      height,
      options.secondary ? InkColors.paperDeep : InkColors.accent,
      12,
    );
    const button = node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    button.interactable = !options.disabled;
    this.text(
      node,
      text,
      0,
      -1,
      options.fontSize ?? 23,
      options.disabled
        ? InkColors.muted
        : options.secondary
          ? InkColors.ink
          : InkColors.white,
      width - 16,
      height - 4,
    );
    if (!options.disabled) {
      node.on(Button.EventType.CLICK, () => void handler(), this);
    }
    return node;
  }

  input(
    parent: Node,
    placeholder: string,
    x: number,
    y: number,
    width: number,
    height = 72,
    maxLength = 200,
    multiline = false,
  ): EditBox {
    const box = this.panel(parent, x, y, width, height, InkColors.white, 10);
    const textNode = new Node('InputText');
    textNode.layer = INK_UI_LAYER;
    box.addChild(textNode);
    textNode.addComponent(UITransform).setContentSize(width - 32, height - 12);
    const textLabel = textNode.addComponent(Label);
    textLabel.fontSize = 23;
    textLabel.lineHeight = 30;
    textLabel.color = InkColors.ink;
    textLabel.enableWrapText = multiline;

    const placeholderNode = new Node('InputPlaceholder');
    placeholderNode.layer = INK_UI_LAYER;
    box.addChild(placeholderNode);
    placeholderNode.addComponent(UITransform).setContentSize(width - 32, height - 12);
    const placeholderLabel = placeholderNode.addComponent(Label);
    placeholderLabel.string = placeholder;
    placeholderLabel.fontSize = 22;
    placeholderLabel.lineHeight = 29;
    placeholderLabel.color = InkColors.muted;
    placeholderLabel.enableWrapText = multiline;

    const edit = box.addComponent(EditBox);
    edit.textLabel = textLabel;
    edit.placeholderLabel = placeholderLabel;
    edit.placeholder = placeholder;
    edit.maxLength = maxLength;
    edit.returnType = multiline
      ? EditBox.KeyboardReturnType.DEFAULT
      : EditBox.KeyboardReturnType.DONE;
    edit.inputMode = multiline ? EditBox.InputMode.ANY : EditBox.InputMode.SINGLE_LINE;
    return edit;
  }

  card(
    parent: Node,
    title: string,
    body: string,
    x: number,
    y: number,
    width = 640,
    height = 120,
    tone: 'normal' | 'accent' | 'warning' = 'normal',
  ): Node {
    const color =
      tone === 'accent'
        ? InkColors.accentSoft
        : tone === 'warning'
          ? new Color(235, 224, 200, 255)
          : InkColors.paperDeep;
    const card = this.panel(parent, x, y, width, height, color, 12);
    this.text(
      card,
      title,
      -width / 2 + 18,
      height / 2 - 30,
      23,
      InkColors.ink,
      width - 36,
      42,
      HorizontalTextAlignment.LEFT,
    );
    this.text(
      card,
      body,
      -width / 2 + 18,
      -10,
      20,
      InkColors.muted,
      width - 36,
      height - 50,
      HorizontalTextAlignment.LEFT,
    );
    return card;
  }

  divider(parent: Node, y: number, width = 650): void {
    const line = new Node('InkDivider');
    line.layer = INK_UI_LAYER;
    parent.addChild(line);
    line.setPosition(new Vec3(0, y, 0));
    line.addComponent(UITransform).setContentSize(width, 2);
    const g = line.addComponent(Graphics);
    g.strokeColor = InkColors.line;
    g.lineWidth = 1;
    g.moveTo(-width / 2, 0);
    g.lineTo(width / 2, 0);
    g.stroke();
  }

  toast(message: string, tone: 'normal' | 'danger' | 'success' = 'normal'): void {
    const root = this.root;
    if (!root) return;
    this.toastNode?.destroy();
    const color =
      tone === 'danger'
        ? InkColors.danger
        : tone === 'success'
          ? InkColors.accent
          : new Color(70, 70, 66, 235);
    const node = this.panel(root, 0, -470, 610, 82, color, 14);
    this.text(node, message, 0, 0, 20, InkColors.white, 570, 72);
    this.toastNode = node;
    setTimeout(() => {
      if (this.toastNode === node) this.toastNode = null;
      node.destroy();
    }, 2400);
  }
}
