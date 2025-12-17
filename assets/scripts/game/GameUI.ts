import { _decorator, Color, Component, Graphics, Node, Prefab } from 'cc';
import { Macro } from './Macro';
const { ccclass, property } = _decorator;

@ccclass('GameUI')
export class GameUI extends Component {
    @property(Graphics)
    private arrowGraphics: Graphics = null;
    @property(Node)
    private gameMapNode: Node = null;
    @property(Prefab)
    private mapRoundItemPre: Prefab = null;

    private static _instance: GameUI = null;
    _arrowPath: { x: number, y: number }[] = [];
    protected onLoad(): void {
        if (!GameUI._instance) {
            GameUI._instance = this;
        } else {
            GameUI._instance = this;
        }
    }
    public static getInstance(): GameUI {
        return GameUI._instance;
    }
    start() {
        (window as any).gameUI = this;
        this.arrowGraphics.node.setParent(this.gameMapNode);

        // 示例：设置箭头路径点
        this._arrowPath.push({ x: 0, y: 200 });
        this._arrowPath.push({ x: 0, y: 100 });
        this._arrowPath.push({ x: 100, y: 100 });
        this._arrowPath.push({ x: 100, y: 0 });
        this._arrowPath.push({ x: 0, y: 0 });
        this._arrowPath.push({ x: 0, y: -100 });

        // 绘制箭头路径
        this.draw();
    }

    /**
     * 绘制箭头路径
     * 遍历 _arrowPath 数组，绘制每段线段，并在路径头部（_arrowPath[0]）绘制箭头
     */
    private draw(): void {
        if (!this.arrowGraphics) return;
        // 至少需要2个点才能绘制
        if (this._arrowPath.length < 2) return;

        this.arrowGraphics.clear();
        this.arrowGraphics.lineCap = Graphics.LineCap.ROUND;
        this.arrowGraphics.lineWidth = 8;
        this.arrowGraphics.strokeColor = new Color(0, 0, 0, 255);
        this.arrowGraphics.fillColor = new Color(0, 0, 0, 255);

        // 遍历路径点，绘制每段线段
        for (let i = 0; i < this._arrowPath.length - 1; i++) {
            const startX = this._arrowPath[i + 1].x;
            const startY = this._arrowPath[i + 1].y;
            const endX = this._arrowPath[i].x;
            const endY = this._arrowPath[i].y;
            // 绘制线段
            this.arrowGraphics.moveTo(startX, startY);
            this.arrowGraphics.lineTo(endX, endY);
            this.arrowGraphics.stroke();
            //如果是第一个绘制完线段后就要额外绘制箭头
            if (i == 0) {
                // 在路径头部（_arrowPath[0]）绘制箭头，方向从 _arrowPath[1] 指向 _arrowPath[0]
                const dir = this.getDir(startX, startY, endX, endY);
                this.drawArrow(endX, endY, dir);
            }
        }
    }
            // 0 ,1
    private drawArrow(endX: number,endY: number, dir: { x: number, y: number }): void {
        this.arrowGraphics.moveTo(endX + dir.x * 15, endY + dir.y * 15);
        this.arrowGraphics.lineTo(endX - dir.y * 15, endY + dir.x * 15);
        this.arrowGraphics.lineTo(endX + dir.y * 15, endY - dir.x * 15);
        this.arrowGraphics.close();
        this.arrowGraphics.fillColor = (new Color(0, 0, 0, 255));
        this.arrowGraphics.fill();
    }
    /**
     * 获取方向向量
     * @param x1 起点X坐标
     * @param y1 起点Y坐标
     * @param x2 终点X坐标
     * @param y2 终点Y坐标
     * @returns 方向向量 {x, y}，支持上下左右四个基本方向
     *          {x: 0, y: 1} 向上
     *          {x: 0, y: -1} 向下
     *          {x: 1, y: 0} 向右
     *          {x: -1, y: 0} 向左
     *          {x: 0, y: 0} 无方向（斜向或相同点）
     */
    private getDir(x1: number, y1: number, x2: number, y2: number): { x: number, y: number } {
        // 垂直方向：向上
        if (x2 === x1 && y2 > y1) {
            return Macro.ArrowDirection.Up;
        }
        // 垂直方向：向下
        if (x2 === x1 && y2 < y1) {
            return Macro.ArrowDirection.Down;
        }
        // 水平方向：向右
        if (y2 === y1 && x2 > x1) {
            return Macro.ArrowDirection.Right;
        }
        // 水平方向：向左
        if (y2 === y1 && x2 < x1) {
            return Macro.ArrowDirection.Left;
        }
        // 其他情况（斜向或相同点）
        return Macro.ArrowDirection.None;
    }

    /**
     * 清空箭头路径
     */
    public clearArrowPath(): void {
        this._arrowPath = [];
        if (this.arrowGraphics) {
            this.arrowGraphics.clear();
        }
    }

    /**
     * 添加路径点
     * @param x X坐标
     * @param y Y坐标
     */
    public addPathPoint(x: number, y: number): void {
        this._arrowPath.push({ x, y });
    }

    /**
     * 设置路径点并重新绘制
     * @param points 路径点数组
     */
    public setArrowPath(points: { x: number, y: number }[]): void {
        this._arrowPath = [...points];
        this.draw();
    }
}

