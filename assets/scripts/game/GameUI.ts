import { _decorator, Color, Component, Graphics, Node, Prefab, Vec3, UITransform } from 'cc';
import { Macro } from './Macro';
import { GameManager } from './GameManager';
const { ccclass, property } = _decorator;

/**
 * 游戏UI组件
 * 负责UI显示和箭头绘制
 */
@ccclass('GameUI')
export class GameUI extends Component {
    @property(Graphics)
    private arrowGraphics: Graphics = null;
    @property(Node)
    private gameMapNode: Node = null;
    @property(Prefab)
    private mapRoundItemPre: Prefab = null;
    @property(Node)
    private testBtn: Node = null;

    private gameManager: GameManager = null;

    protected onLoad(): void {
        // 初始化游戏管理器
        this.gameManager = GameManager.getInstance();
        this.gameManager.init(this.gameMapNode, this.mapRoundItemPre);
    }

    async start() {
        (window as any).gameUI = this;
        
        // 初始化Graphics
        this.initGraphics();
        this.testBtn.on(Node.EventType.TOUCH_END, this.onTestBtnClick, this);
        // 加载关卡
        await this.gameManager.loadLevel(1);
        
        // 初始化箭头路径
        this.gameManager.initArrows();
        
        // 绘制箭头
        this.draw();
        
        // 确保箭头在圆圈上方
        if (this.arrowGraphics) {
            this.arrowGraphics.node.setSiblingIndex(999);
        }
    }
    onTestBtnClick(){
        this.gameManager.arrowPathMove(5,0);
        this.draw();
    }
    /**
     * 初始化Graphics组件
     */
    private initGraphics(): void {
        if (!this.arrowGraphics) {
            const graphicsNode = new Node();
            graphicsNode.addComponent(UITransform);
            graphicsNode.name = 'arrowGraphics';
            this.arrowGraphics = graphicsNode.addComponent(Graphics);
            graphicsNode.setParent(this.gameMapNode);
            graphicsNode.setPosition(new Vec3(0, 0, 0));
        }
        
        this.arrowGraphics.lineJoin = Graphics.LineJoin.MITER;
        this.arrowGraphics.miterLimit = 10;
    }
    /**
     * 绘制箭头路径
     * 从GameManager获取路径数据并绘制
     */
    private draw(): void {
        if (!this.arrowGraphics) return;
        
        const arrowPaths = this.gameManager.getArrowPaths();
        if (arrowPaths.length === 0) return;

        this.arrowGraphics.clear();
        this.arrowGraphics.lineCap = Graphics.LineCap.ROUND;
        this.arrowGraphics.lineWidth = 8;
        this.arrowGraphics.strokeColor = new Color(0, 0, 0, 255);
        this.arrowGraphics.fillColor = new Color(0, 0, 0, 255);

        // 遍历所有路径
        for (let pathIndex = 0; pathIndex < arrowPaths.length; pathIndex++) {
            const path = arrowPaths[pathIndex];
            // 至少需要2个点才能绘制
            if (path.length < 2) continue;

            // 遍历当前路径的点，绘制每段线段
            for (let i = 0; i < path.length - 1; i++) {
                const startX = path[i + 1].x;
                const startY = path[i + 1].y;
                const endX = path[i].x;
                const endY = path[i].y;
                // 绘制线段
                this.arrowGraphics.moveTo(startX, startY);
                this.arrowGraphics.lineTo(endX, endY);
                this.arrowGraphics.stroke();
                // 在路径头部（第一个线段）绘制箭头
                if (i == 0) {
                    // 在路径头部绘制箭头，方向从起点指向终点
                    const dir = this.gameManager.getDir(startX, startY, endX, endY);
                    this.drawArrow(endX, endY, dir);
                }
            }
        }
    }
    private drawArrow(endX: number, endY: number, dir: { x: number, y: number }): void {
        this.arrowGraphics.moveTo(endX + dir.x * 15, endY + dir.y * 15);
        this.arrowGraphics.lineTo(endX - dir.y * 15, endY + dir.x * 15);
        this.arrowGraphics.lineTo(endX + dir.y * 15, endY - dir.x * 15);
        this.arrowGraphics.close();
        this.arrowGraphics.fillColor = (new Color(0, 0, 0, 255));
        this.arrowGraphics.fill();
    }
    

    /**
     * 清空所有箭头路径
     */
    public clearArrowPath(): void {
        this.gameManager.clearArrowPaths();
        if (this.arrowGraphics) {
            this.arrowGraphics.clear();
        }
    }

    /**
     * 添加一条新的箭头路径
     * @param points 路径点数组
     */
    public addArrowPath(points: { x: number, y: number }[]): void {
        this.gameManager.addArrowPath(points);
        this.draw();
    }

    /**
     * 设置所有箭头路径并重新绘制
     * @param paths 路径数组，每个元素是一条路径
     */
    public setArrowPaths(paths: { x: number, y: number }[][]): void {
        this.gameManager.setArrowPaths(paths);
        this.draw();
    }

    /**
     * 重新绘制箭头（公开方法，供外部调用）
     */
    public redrawArrows(): void {
        this.draw();
    }
}

