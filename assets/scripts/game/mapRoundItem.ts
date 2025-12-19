import { _decorator, Color, Component, Node, Sprite } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('mapRoundItem')
export class mapRoundItem extends Component {
    @property(Node)
    private roundBg: Node = null;

    _isInMap:boolean = false;  //是否绘制在地图上
    _isFree: boolean = false; //地图当前圆点是否已经被绘制占用
    _round: number = 0; //地图当前圆点所在行
    _colMun:number = 0; //地图当前圆点所在列
    _posX:number = 0;
    _posY:number = 0;
    initItem(roundIndex: number, colMunIndex: number, posX: number, posY: number,isInMap:boolean = false){
        this._round = roundIndex;
        this._colMun = colMunIndex;
        this._posX = posX;
        this._posY = posY;
        this._isFree = false;
        this._isInMap = isInMap;
        if(this._isInMap){
            this.roundBg.active = true;
            this.roundBg.getComponent(Sprite).color = Color.WHITE;
        }else{
            // this.roundBg.active = false;
            this.roundBg.getComponent(Sprite).color = Color.RED;
        }
    }
    get isInMap(): boolean {
        return this._isInMap;
    }
    set isInMap(isInMap: boolean){
        this._isInMap = isInMap;
    }
    get isFree(): boolean {
        return this._isFree;
    }
    set isFree(isFree: boolean){
        this._isFree = isFree;
    }
    get PosX(): number {
        return this._posX;
    }
    get PosY(): number {
        return this._posY;
    }
    set RoundIndex(roundIndex: number){
        this._round = roundIndex;
    }
    set ColMunIndex(colMunIndex: number){
        this._colMun = colMunIndex;
    }
    get RoundIndex(): number {
        return this._round;
    }
    get ColMunIndex(): number {
        return this._colMun;
    }
}

